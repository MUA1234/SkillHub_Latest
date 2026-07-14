defmodule SkillHub.Emails do
  @moduledoc """
  Transactional emails (verification, password reset, welcome), delivered via
  `SkillHub.Mailer`. All sends are best-effort and never raise into the caller —
  a mail failure must not break registration or a reset request. Mirrors the
  Python `email_service`, minus the Jinja/i18n templating (kept simple here).
  """
  import Swoosh.Email

  alias SkillHub.Mailer

  defp from do
    cfg = Application.get_env(:skillhub, :email, [])
    {cfg[:from_name] || "SkillHub", cfg[:from_email] || "noreply@skillhub.lk"}
  end

  @doc "Best-effort deliver. Returns :ok | {:error, reason}; never raises."
  def deliver(email) do
    Mailer.deliver(email)
  rescue
    e -> {:error, e}
  catch
    :exit, reason -> {:error, reason}
  end

  def verification(to_email, verification_url, first_name \\ nil) do
    new()
    |> to(to_email)
    |> from(from())
    |> subject("Verify your SkillHub email")
    |> html_body(layout("Verify your email", """
      <p>Hi #{escape(first_name) || "there"},</p>
      <p>Welcome to SkillHub! Please confirm your email address to activate your account.</p>
      #{button("Verify email", verification_url)}
      <p style="color:#667085;font-size:13px">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    """))
    |> text_body("Verify your SkillHub email: #{verification_url} (expires in 24 hours)")
    |> deliver()
  end

  def password_reset(to_email, reset_url, first_name \\ nil) do
    new()
    |> to(to_email)
    |> from(from())
    |> subject("Reset your SkillHub password")
    |> html_body(layout("Reset your password", """
      <p>Hi #{escape(first_name) || "there"},</p>
      <p>We received a request to reset your SkillHub password.</p>
      #{button("Reset password", reset_url)}
      <p style="color:#667085;font-size:13px">This link expires in 1 hour. If you didn't request this, no action is needed.</p>
    """))
    |> text_body("Reset your SkillHub password: #{reset_url} (expires in 1 hour)")
    |> deliver()
  end

  def welcome(to_email, first_name \\ nil, role \\ nil) do
    role_line =
      case role do
        "teacher" -> "Set up your teacher profile and publish your first course."
        "sponsor" -> "Explore students and campaigns you can support."
        _ -> "Browse courses, join live sessions, and connect with teachers."
      end

    new()
    |> to(to_email)
    |> from(from())
    |> subject("Welcome to SkillHub 🎓")
    |> html_body(layout("Welcome to SkillHub", """
      <p>Hi #{escape(first_name) || "there"},</p>
      <p>Your email is verified and your account is ready. #{role_line}</p>
      #{button("Open SkillHub", frontend_base())}
    """))
    |> text_body("Welcome to SkillHub! #{role_line}")
    |> deliver()
  end

  # --- rendering helpers -----------------------------------------------------

  defp layout(title, inner) do
    """
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#101828">
      <h2 style="color:#1570ef;margin:0 0 16px">#{title}</h2>
      #{inner}
      <hr style="border:none;border-top:1px solid #eaecf0;margin:24px 0"/>
      <p style="color:#98a2b3;font-size:12px">SkillHub — inclusive education for Sri Lanka.</p>
    </div>
    """
  end

  defp button(label, url) do
    """
    <p style="margin:20px 0">
      <a href="#{url}" style="background:#1570ef;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">#{label}</a>
    </p>
    <p style="color:#667085;font-size:13px;word-break:break-all">Or paste this link: #{url}</p>
    """
  end

  defp frontend_base do
    System.get_env("FRONTEND_URL", "http://localhost:3000") |> String.trim_trailing("/")
  end

  defp escape(nil), do: nil
  defp escape(s) do
    s
    |> to_string()
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end
end

