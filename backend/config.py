from pydantic_settings import BaseSettings
from typing import List, Optional
import os


_DEFAULT_DEV_SECRET_KEYS = {
    "skillhub_super_secret_key_2024_production_change_in_production",
    "change-me",
    "secret",
    "",
}


class Settings(BaseSettings):
    model_config = {"extra": "allow"}

    database_url: str = "postgresql://postgres:MUAmusic1234%23%40@db.juwpzzkuyqygcjrubqpt.supabase.co:5432/postgres"
    database_pool_url: str = "postgresql://postgres.juwpzzkuyqygcjrubqpt:MUAmusic1234%23%40@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"

    db_host: str = "aws-1-ap-southeast-1.pooler.supabase.com"
    db_port: int = 6543
    db_user: str = "postgres.juwpzzkuyqygcjrubqpt"
    db_password: str = "MUAmusic1234#@"
    db_name: str = "postgres"

    supabase_url: str = os.getenv("SUPABASE_URL", "https://juwpzzkuyqygcjrubqpt.supabase.co")
    supabase_key: str = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1d3B6emt1eXF5Z2NqcnVicXB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTkyOTgsImV4cCI6MjA4NDA3NTI5OH0.aYy7VG-Q1Yon9mOgucL8EDbefs0GyfD7HbWDCDrirA4")
    supabase_service_key: Optional[str] = os.getenv("SUPABASE_SERVICE_KEY", None)

    secret_key: str = os.getenv("SECRET_KEY", "skillhub_super_secret_key_2024_production_change_in_production")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    api_v1_str: str = os.getenv("API_V1_STR", "/api/v1")
    project_name: str = os.getenv("PROJECT_NAME", "SkillHub API")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"
    environment: str = os.getenv("ENVIRONMENT", os.getenv("RAILWAY_ENVIRONMENT", "development"))

    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000")

    payhere_merchant_id: Optional[str] = os.getenv("PAYHERE_MERCHANT_ID", None)
    payhere_merchant_secret: Optional[str] = os.getenv("PAYHERE_MERCHANT_SECRET", None)
    payhere_sandbox: bool = os.getenv("PAYHERE_SANDBOX", "true").lower() != "false"

    @property
    def payhere_enabled(self) -> bool:
        """True only when real merchant credentials are configured."""
        return bool((self.payhere_merchant_id or "").strip()
                    and (self.payhere_merchant_secret or "").strip())

    @property
    def payhere_checkout_url(self) -> str:
        return (
            "https://sandbox.payhere.lk/pay/checkout"
            if self.payhere_sandbox
            else "https://www.payhere.lk/pay/checkout"
        )

    cookie_name: str = os.getenv("AUTH_COOKIE_NAME", "skillhub_session")

    @property
    def is_production(self) -> bool:
        return (
            self.environment == "production"
            or os.getenv("RAILWAY_ENVIRONMENT") is not None
            or os.getenv("RAILWAY_PUBLIC_DOMAIN") is not None
        )

    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    @property
    def cookie_samesite(self) -> str:
        return "none" if self.is_production else "lax"

    @property
    def backend_cors_origins(self) -> List[str]:
        if self.is_production:
            origins: List[str] = []

            if self.frontend_url:
                fu = self.frontend_url.rstrip("/")
                origins.append(fu)
                if fu.startswith("http://"):
                    origins.append("https://" + fu[len("http://"):])

            railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
            if railway_domain:
                origins.extend([f"https://{railway_domain}", f"http://{railway_domain}"])

            cors_origins_env = os.getenv("CORS_ORIGINS", "")
            if cors_origins_env:
                origins.extend([o.strip().rstrip("/") for o in cors_origins_env.split(",") if o.strip()])

            seen = set()
            unique_origins = []
            for o in origins:
                if o and o not in seen:
                    seen.add(o)
                    unique_origins.append(o)
            return unique_origins
        else:
            return [
                "http://localhost:3000",
                "https://localhost:3000",
                "http://localhost:8000",
                "http://127.0.0.1:3000",
                "https://127.0.0.1:3000",
            ]

    smtp_tls: bool = True
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_host: str = os.getenv("SMTP_HOST", "smtp.migadu.com")
    smtp_user: Optional[str] = os.getenv("SMTP_USER")
    smtp_password: Optional[str] = os.getenv("SMTP_PASSWORD")
    emails_from_email: str = os.getenv("EMAILS_FROM_EMAIL", "noreply@skillhub.lk")
    emails_from_name: str = os.getenv("EMAILS_FROM_NAME", "SkillHub")
    emails_enabled: bool = os.getenv("EMAILS_ENABLED", "auto").lower() in {"true", "1", "yes"}

    vapid_public_key: Optional[str] = os.getenv("VAPID_PUBLIC_KEY")
    vapid_private_key: Optional[str] = os.getenv("VAPID_PRIVATE_KEY")
    vapid_subject: str = os.getenv("VAPID_SUBJECT", "mailto:noreply@skillhub.lk")

    anthropic_api_key: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

    twilio_account_sid: Optional[str] = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_auth_token: Optional[str] = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_sender: Optional[str] = os.getenv("TWILIO_SENDER")
    default_country_code: str = os.getenv("DEFAULT_COUNTRY_CODE", "+94")

    redis_url: str = "redis://localhost:6379/0"

    max_file_size: int = 10485760
    allowed_file_types: List[str] = [
        "image/jpeg", "image/png", "image/gif",
        "application/pdf", "video/mp4", "text/plain"
    ]

    websocket_url: str = "ws://localhost:8000/ws"

    log_level: str = "INFO"
    log_format: str = "json"


def validate_secret_key(s: Settings) -> None:
    """Refuse to boot in production with a missing or default SECRET_KEY.

    Why: the default value is committed to git and used to sign JWTs. Anyone
    who reads the repo could forge tokens against any deployment that didn't
    override it. Loud failure is safer than a quiet vulnerability.
    """
    if not s.is_production:
        return
    if not s.secret_key or s.secret_key.strip() in _DEFAULT_DEV_SECRET_KEYS:
        raise RuntimeError(
            "SECRET_KEY env var is missing or set to the default. "
            "Generate a strong random value (e.g. `python -c 'import secrets; print(secrets.token_urlsafe(64))'`) "
            "and set it on the deployment."
        )


settings = Settings()
