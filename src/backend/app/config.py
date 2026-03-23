from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://vulnprio:vulnprio_dev@db:5432/vulnprio"

    # Application
    app_name: str = "VulnPrio"
    debug: bool = False

    # NVD API key (optional — higher rate limits when provided)
    nvd_api_key: Optional[str] = None


settings = Settings()
