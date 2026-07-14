defmodule SkillHub.Accounts do
  @moduledoc """
  The Accounts context over the shared Supabase `users` table: lookups,
  bcrypt authentication, and registration (user + profile + language pref),
  wire-compatible with the Python backend.
  """
  import Ecto.Query, warn: false

  alias SkillHub.Repo
  alias SkillHub.SQL
  alias SkillHub.Accounts.{User, Password}

  @doc "Fetch a user by id (string uuid). Returns nil when absent."
  def get_user(id) when is_binary(id), do: Repo.get(User, id)

  @doc "Fetch a user by email (case-sensitive, matching the Python lookup)."
  def get_user_by_email(email) when is_binary(email), do: Repo.get_by(User, email: email)

  @doc """
  Authenticate an email + password. Always runs a bcrypt comparison (real or
  dummy) so timing doesn't reveal whether the account exists. Returns the user
  only when active AND the password matches.
  """
  def authenticate(email, password) do
    user = get_user_by_email(email)
    hash = user && user.password_hash

    cond do
      Password.verify(password, hash || "") == false -> {:error, :invalid_credentials}
      user.is_active == false -> {:error, :inactive}
      true -> {:ok, user}
    end
  end

  @doc """
  Register a new user: insert the user (bcrypt-hashed password), then best-effort
  a profile row and a default language preference. Matches SupabaseService.create_user.
  """
  def register_user(attrs) do
    email = attrs[:email] || attrs["email"]

    if get_user_by_email(email) do
      {:error, :already_registered}
    else
      user_id = Ecto.UUID.generate()

      params = %{
        id: user_id,
        email: email,
        password_hash: Password.hash(attrs[:password] || attrs["password"]),
        role: to_string(attrs[:role] || attrs["role"]),
        is_verified: false,
        is_active: true
      }

      case %User{} |> User.create_changeset(params) |> Repo.insert() do
        {:ok, user} ->
          seed_profile(user_id, attrs)
          seed_language_preference(user_id)
          {:ok, user}

        {:error, changeset} ->
          {:error, changeset}
      end
    end
  end

  @doc "Update a user's password hash (used by reset-password)."
  def set_password(user_id, plaintext) do
    from(u in User, where: u.id == ^user_id)
    |> Repo.update_all(set: [password_hash: Password.hash(plaintext), updated_at: NaiveDateTime.utc_now()])
  end

  def mark_verified(user_id) do
    from(u in User, where: u.id == ^user_id)
    |> Repo.update_all(set: [is_verified: true, updated_at: NaiveDateTime.utc_now()])
  end

  # --- helpers ---------------------------------------------------------------
  # Best-effort raw-SQL seeds (now() handles timestamps — some of these tables
  # use timestamptz, which the shared Ecto naive_datetime encoder chokes on).

  defp seed_profile(user_id, attrs) do
    first = attrs[:first_name] || attrs["first_name"]
    last = attrs[:last_name] || attrs["last_name"]

    if first || last do
      safe(fn ->
        SQL.maps(
          "insert into public.user_profiles (id, user_id, first_name, last_name, reputation_score, created_at, updated_at) values (gen_random_uuid(), $1::uuid, $2, $3, 0, now(), now())",
          [user_id, first || "", last || ""]
        )
      end)
    end
  end

  defp seed_language_preference(user_id) do
    safe(fn ->
      SQL.maps(
        "insert into public.language_preferences (user_id, preferred_language, fallback_language, created_at, updated_at) values ($1::uuid, 'en', 'en', now(), now())",
        [user_id]
      )
    end)
  end

  defp safe(fun) do
    fun.()
  rescue
    _ -> :ok
  end
end
