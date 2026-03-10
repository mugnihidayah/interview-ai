import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Axios Instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 120_000,
});

// Request interceptor - attach token from cookie as fallback
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = Cookies.get("access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      const skipAuthRedirect =
        error.config?.headers &&
        (error.config.headers["X-Skip-Auth-Redirect"] === "1" ||
          error.config.headers["x-skip-auth-redirect"] === "1");

      // Clear any client-side token
      if (typeof window !== "undefined" && !skipAuthRedirect) {
        Cookies.remove("access_token");
        // Redirect to login
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

// Types
interface ApiErrorResponse {
  detail: string;
}

// Auth Types
export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

// Profile Types
export interface UpdateProfileRequest {
  full_name: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UserStats {
  total_sessions: number;
  completed_sessions: number;
  average_score: number | null;
  best_score: number | null;
  member_since: string | null;
}

// Interview Types
export interface StartInterviewRequest {
  resume_text: string;
  job_description: string;
  interview_type: "behavioral" | "technical";
  difficulty: "junior" | "mid" | "senior";
  language?: "en" | "id";
}

export interface StartInterviewResponse {
  session_id: string;
  status: string;
  current_question: string;
  question_number: number;
  total_questions: number;
  candidate_name: string;
  interview_type: string;
  difficulty: string;
  error_message?: string | null;
}

export interface SubmitAnswerRequest {
  session_id: string;
  answer: string;
  prefetch_tts?: boolean;
}

export interface Evaluation {
  score: number;
  strengths: string[];
  weaknesses: string[];
}

export interface PerQuestionFeedback {
  question_number: number;
  question: string;
  candidate_answer: string;
  score: number;
  feedback: string;
  better_answer: string;
}

export interface FinalReport {
  overall_score: number;
  overall_grade: string;
  summary: string;
  per_question_feedback: PerQuestionFeedback[];
  top_strengths: string[];
  areas_to_improve: string[];
  action_items: string[];
  ready_for_role: boolean;
  ready_explanation: string;
}

export interface SubmitAnswerResponse {
  session_id: string;
  status: string;
  current_question: string | null;
  question_number: number;
  is_follow_up: boolean;
  total_questions: number;
  last_evaluation: Evaluation | null;
  final_report: FinalReport | null;
  tts_cache_key?: string | null;
  error_message?: string | null;
}

export interface SessionResponse {
  session_id: string;
  status: string;
  candidate_name: string | null;
  interview_type: string | null;
  difficulty: string | null;
  language: string | null;
  current_question: string | null;
  question_number: number;
  is_follow_up: boolean;
  total_questions: number;
  questions_answered: number;
  overall_score: number | null;
  overall_grade: string | null;
  tts_cache_key?: string | null;
  error_message?: string | null;
}

export interface SessionSummary {
  session_id: string;
  interview_type: string;
  difficulty: string;
  status: string;
  overall_score: number | null;
  overall_grade: string | null;
  candidate_name: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface HistoryResponse {
  sessions: SessionSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ReportResponse {
  session_id: string;
  status: string;
  report: FinalReport | null;
  error_message?: string | null;
}

// Auth API
export const authAPI = {
  register: async (email: string, password: string, full_name: string) => {
    const { data } = await api.post<AuthResponse>("/auth/register", {
      email,
      password,
      full_name,
    });
    return data;
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    return data;
  },

  logout: async () => {
    const { data } = await api.post("/auth/logout");
    return data;
  },

  me: async () => {
    const { data } = await api.get<User>("/auth/me", {
      headers: {
        "X-Skip-Auth-Redirect": "1",
      },
    });
    return data;
  },
};

// Profile API
export const profileAPI = {
  updateProfile: async (payload: UpdateProfileRequest) => {
    const { data } = await api.put<User>("/auth/profile", payload);
    return data;
  },

  changePassword: async (payload: ChangePasswordRequest) => {
    const { data } = await api.put<{ message: string }>(
      "/auth/password",
      payload
    );
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<UserStats>("/auth/stats");
    return data;
  },
};

// Voice API
export const voiceAPI = {
  tts: async (
    text: string,
    language: string = "en",
    options: {
      cacheKey?: string;
    } = {}
  ): Promise<Blob> => {
    if (options.cacheKey) {
      try {
        const response = await api.get(
          `/api/interview/voice/tts/prefetch/${encodeURIComponent(options.cacheKey)}`,
          { responseType: "blob" }
        );
        return response.data;
      } catch {
        // Fall back to on-demand TTS if prefetched audio is unavailable.
      }
    }

    const response = await api.post(
      "/api/interview/voice/tts",
      { text, language },
      { responseType: "blob" }
    );
    return response.data;
  },

  transcribe: async (
    audioBlob: Blob,
    language: string = "en",
    options: {
      filename?: string;
      sessionId?: string;
    } = {}
  ): Promise<{ text: string; status: string }> => {
    const formData = new FormData();
    formData.append("file", audioBlob, options.filename || "recording.webm");
    formData.append("language", language);
    if (options.sessionId) {
      formData.append("session_id", options.sessionId);
    }

    const { data } = await api.post(
      "/api/interview/voice/transcribe",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
      }
    );
    return data;
  },
};

// Interview API
export const interviewAPI = {
  start: async (payload: StartInterviewRequest) => {
    const { data } = await api.post<StartInterviewResponse>(
      "/api/interview/start",
      payload
    );
    return data;
  },

  submitAnswer: async (payload: SubmitAnswerRequest) => {
    const { data } = await api.post<SubmitAnswerResponse>(
      "/api/interview/answer",
      payload
    );
    return data;
  },

  getSession: async (
    sessionId: string,
    options: {
      prefetchTTS?: boolean;
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (options.prefetchTTS) {
      params.set("prefetch_tts", "true");
    }

    const { data } = await api.get<SessionResponse>(
      `/api/interview/session/${sessionId}${params.size ? `?${params.toString()}` : ""}`
    );
    return data;
  },

  getHistory: async (page: number = 1, pageSize: number = 10) => {
    const { data } = await api.get<HistoryResponse>(
      `/api/interview/history?page=${page}&page_size=${pageSize}`
    );
    return data;
  },

  getReport: async (sessionId: string) => {
    const { data } = await api.get<ReportResponse>(
      `/api/interview/${sessionId}/report`
    );
    return data;
  },

  deleteSession: async (sessionId: string) => {
    const { data } = await api.delete<{ message: string; session_id: string }>(
      `/api/interview/session/${sessionId}`
    );
    return data;
  },
};

// Helper to extract error message from AxiosError
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    return (
      error.response?.data?.detail ||
      error.message ||
      "An unexpected error occurred"
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

export default api;
