defmodule SkillHub.Accounts.Password do
  @moduledoc """
  bcrypt hashing, wire-compatible with the Python backend's passlib bcrypt
  hashes (both emit `$2b$12$…` and truncate to 72 bytes), so a password set by
  either backend verifies on the other. Backed by the vendored, zig-built
  `bcrypt_elixir` NIF.
  """

  @doc "Hash a plaintext password for storage in `users.password_hash`."
  def hash(password) when is_binary(password), do: Bcrypt.hash_pwd_salt(truncate(password))

  @doc """
  Verify a plaintext password against a stored bcrypt hash. Runs a dummy hash
  when the stored hash is missing so response time doesn't leak account
  existence.
  """
  def verify(password, hash) when is_binary(password) and is_binary(hash) and hash != "" do
    Bcrypt.verify_pass(truncate(password), hash)
  end

  def verify(_password, _hash) do
    Bcrypt.no_user_verify()
    false
  end

  # bcrypt only considers the first 72 bytes; passlib truncates explicitly, so
  # we match on the byte boundary for identical results.
  defp truncate(password) do
    case password do
      <<head::binary-size(72), _rest::binary>> -> head
      _ -> password
    end
  end
end
