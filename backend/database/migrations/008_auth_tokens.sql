-- Migration 008: Auth tokens for email verification and password reset.
--
-- Tokens are stored hashed (SHA-256 hex) so a database leak does not allow
-- an attacker to consume them. The plain token is sent only via email.
--
-- Single-use enforcement is via `used_at` / `verified_at` being non-null.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  varchar(128) NOT NULL UNIQUE,
  expires_at  timestamp with time zone NOT NULL,
  used_at     timestamp with time zone,
  created_at  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_ip  varchar(64)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON public.password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON public.password_reset_tokens (token_hash)
  WHERE used_at IS NULL;


CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash   varchar(128) NOT NULL UNIQUE,
  expires_at   timestamp with time zone NOT NULL,
  verified_at  timestamp with time zone,
  created_at   timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON public.email_verification_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_active
  ON public.email_verification_tokens (token_hash)
  WHERE verified_at IS NULL;
