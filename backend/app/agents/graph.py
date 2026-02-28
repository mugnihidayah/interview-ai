import logging
from typing import Optional, cast

from typing_extensions import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agents.coach import generate_coaching_report
from app.agents.evaluator import evaluate_answer
from app.agents.interviewer import (
    advance_question,
    generate_question,
    plan_interview,
)
from app.agents.resume_analyzer import analyze_resume
from app.core.config import settings
from app.models.schemas import InterviewState

logger = logging.getLogger(__name__)


# GRAPH STATE
class GraphState(TypedDict, total=False):
    """
    Graph state that mirrors InterviewState fields.

    Using TypedDict because LangGraph requires it for state schema.
    Conversion to/from InterviewState happends in each node
    to maintain validation and type safety.

    total=False means all fields are optional, allowing partial updates.
    """

    resume_text: str
    job_description: str
    interview_type: str
    difficulty: str
    candidate_profile: Optional[dict]
    interview_plan: Optional[dict]
    current_question_index: int
    current_question: str
    is_follow_up: bool
    follow_up_count: int
    qa_pairs: list
    final_report: Optional[dict]
    status: str
    error_message: Optional[str]


# STATE CONVERSION HELPERS
def _to_interview_state(data: GraphState) -> InterviewState:
    """Convert graph state dict to InterviewState."""
    return InterviewState.model_validate(data)

def _to_graph_state(state: InterviewState) -> GraphState:
    """Convert InterviewState to graph state dict."""
    return cast(GraphState, state.model_dump())


# NODE FUNCTIONS
def analyze_resume_node(state:GraphState) -> GraphState:
    """Node for analyze resume against job description."""
    logger.info("Graph Node: analyze_resume")
    result = analyze_resume(_to_interview_state(state))
    return _to_graph_state(result)

def plan_interview_node(state:GraphState) -> GraphState:
    """Node for create structured interview plan."""
    logger.info("Graph Node: plan_interview")
    result = plan_interview(_to_interview_state(state))
    return _to_graph_state(result)

def generate_question_node(state:GraphState) -> GraphState:
    """Node for generate next interview question."""
    logger.info("Graph Node: generate_question")
    result = generate_question(_to_interview_state(state))
    return _to_graph_state(result)

def evaluate_answer_node(state:GraphState) -> GraphState:
    """Node for evaluate the last answer."""
    logger.info("Graph Node: evaluate_answer")
    result = evaluate_answer(_to_interview_state(state))
    return _to_graph_state(result)

def advance_and_generate_node(state:GraphState) -> GraphState:
    """Node for advance question index and generate next question."""
    logger.info("Graph Node: advance_and_generate")
    interview_state = _to_interview_state(state)
    interview_state = advance_question(interview_state)
    interview_state = generate_question(interview_state)
    return _to_graph_state(interview_state)

def generate_report_node(state:GraphState) -> GraphState:
    """Node for generate coaching report after interview."""
    logger.info("Graph Node: generate_report")
    result = generate_coaching_report(_to_interview_state(state))
    return _to_graph_state(result)


# CONDITIONAL EDGE FUNCTION
def check_setup_error(state:GraphState) -> str:
    """Route to END if error occured during setup, otherwise continue."""
    if state.get("status") == "error":
        logger.warning("Error detected in setup, routing to END")
        return "error"
    return "continue"

def check_interview_complete(state:GraphState) -> str:
    """
    After evaluation, determine next step:
    - "error": something went wrong
    - "done": all questions answered and go to coaching
    - "continue": more questions and generate next question

    Logic: current_question_index tracks which question was just answered.
    If index >= MAX_QUESTIONS - 1, this was the last question.
    """

    if state.get("status") == "error":
        logger.warning("Error detected during evaluation, routing to END")
        return "error"
    
    current_index = state.get("current_question_index", 0)
    if current_index >= settings.MAX_QUESTIONS - 1:
        logger.info("All questions completed, routing to coaching")
        return "done"
    
    logger.info("More questions remaining, routing to next question")
    return "continue"


# GRAPH BUILDERS
def build_setup_graph() -> CompiledStateGraph:
    """
    Setup graph: runs once at interview start.

    Flow:
    START -> analyze_resume -> plan_interview -> generate_question -> END

    Returns state with:
    - candidate_profile populated
    - interview_plan populated
    - current_question set to first question

    Error handling: if any step fails, routes to END with error status.
    """

    builder = StateGraph(GraphState)

    # Nodes
    builder.add_node("analyze_resume", analyze_resume_node)
    builder.add_node("plan_interview", plan_interview_node)
    builder.add_node("generate_question", generate_question_node)

    # Edges with error checking
    builder.add_edge(START, "analyze_resume")
    builder.add_conditional_edges(
        "analyze_resume",
        check_setup_error,
        {"continue": "plan_interview", "error": END},
    )
    builder.add_conditional_edges(
        "plan_interview",
        check_setup_error,
        {"continue": "generate_question", "error": END},
    )
    builder.add_edge("generate_question", END)

    return builder.compile()


def build_process_answer_graph() -> CompiledStateGraph:
    """
    Process answer graph: runs after each user answer is recorded.

    Flow:
    START → evaluate → check_complete
        → "continue" : advance_and_generate → END (next question ready)
        → "done"     : coaching → END (final report ready)
        → "error"    : END

    Prerequisites:
    - Answer has been recorded in qa_pairs
    - Follow-up logic has been resolved (if any)
    """

    builder = StateGraph(GraphState)

    # Nodes
    builder.add_node("evaluate", evaluate_answer_node)
    builder.add_node("next_question", advance_and_generate_node)
    builder.add_node("coaching", generate_report_node)

    # Edges with conditional routing
    builder.add_edge(START, "evaluate")
    builder.add_conditional_edges(
        "evaluate",
        check_interview_complete,
        {
            "continue": "next_question",
            "done": "coaching",
            "error": END,
        },
    )
    builder.add_edge("next_question", END)
    builder.add_edge("coaching", END)

    return builder.compile()


# COMPILED GRAPHS
setup_graph = build_setup_graph()
process_answer_graph = build_process_answer_graph()


# GRAPH RUNNERS
def run_setup(state: InterviewState) -> InterviewState:
    """
    Run the setup graph.

    Input:  InterviewState with resume_text, job_description,
            interview_type, difficulty
    Output: InterviewState with candidate_profile, interview_plan,
            and first question ready

    Called once at the start of an interview session.
    """

    logger.info("Running setup graph...")

    try:
        result = setup_graph.invoke(_to_graph_state(state))
        return _to_interview_state(cast(GraphState, result))
    except Exception as e:
        logger.error("Setup graph failed: %s", str(e))
        state.status = "error"
        state.error_message = f"Interview setup failed: {type(e).__name__}"
        return state
    

def run_process_answer(state: InterviewState) -> InterviewState:
    """
    Run the process answer graph.

    Input: InterviewState with latest answer recorded in qa_pairs
    Output: InterviewState with evaluation + next question or final report

    Called after each answer (and optional follow-up) is recorded.
    """

    logger.info("Running process answer graph...")

    try:
        result = process_answer_graph.invoke(_to_graph_state(state))
        return _to_interview_state(cast(GraphState, result))
    except Exception as e:
        logger.error("Process answer graph failed: %s", str(e))
        state.status = "error"
        state.error_message = f"Answer processing failed: {type(e).__name__}"
        return state