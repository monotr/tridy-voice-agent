
from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    REALTIME_MODEL: str = os.getenv("REALTIME_MODEL", "gpt-4o-mini-realtime-preview")
    REALTIME_ENDPOINT: str = os.getenv("REALTIME_ENDPOINT", "https://api.openai.com/v1/realtime")
    ALLOWED_ORIGINS: List[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tridy.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me")

    class Config:
        env_file = ".env"

settings = Settings()
