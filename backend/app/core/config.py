from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import find_dotenv


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # API keys
    GOOGLE_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # LLM models
    PRIMARY_MODEL: str = "openai/gpt-oss-120b"
    FALLBACK_MODEL: str = "gemini-2.5-flash"
    LLM_TEMPERATURE: float = 0.7

    # interview config
    MAX_QUESTIONS: int = 8
    MAX_FOLLOW_UPS: int = 1
    SCORE_MIN: int = 1
    SCORE_MAX: int = 10

    # app
    APP_ENV: str = "development"

    model_config = SettingsConfigDict(
        env_file=find_dotenv(),
        env_file_encoding="utf-8",
    )

settings = Settings()