defmodule SkillHub.Repo do
  use Ecto.Repo,
    otp_app: :skillhub,
    adapter: Ecto.Adapters.Postgres
end
