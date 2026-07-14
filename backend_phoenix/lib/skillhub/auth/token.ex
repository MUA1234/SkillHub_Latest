defmodule SkillHub.Auth.Token do
  @moduledoc """
  HS256 JWTs that are cross-compatible with the Python backend
  (`core/security.py`). A token minted here validates there and vice versa:
  same secret, same algorithm, same minimal claim set (`sub` + `exp`).
  """

  defp config, do: Application.fetch_env!(:skillhub, :auth)

  defp signer do
    cfg = config()
    Joken.Signer.create(cfg[:jwt_algorithm], cfg[:jwt_secret])
  end

  @doc "Mint an access token for a user id. `exp` is a unix timestamp, like jose."
  def generate(user_id, ttl_minutes \\ nil) do
    ttl = ttl_minutes || config()[:access_token_ttl_minutes]
    exp = DateTime.utc_now() |> DateTime.add(ttl * 60, :second) |> DateTime.to_unix()
    claims = %{"sub" => to_string(user_id), "exp" => exp}

    case Joken.generate_and_sign(%{}, claims, signer()) do
      {:ok, token, _claims} -> token
      {:error, reason} -> raise "failed to sign JWT: #{inspect(reason)}"
    end
  end

  @doc "Verify signature + expiry. Returns `{:ok, user_id}` or `{:error, :invalid}`."
  def verify(token) when is_binary(token) do
    with {:ok, claims} <- Joken.Signer.verify(token, signer()),
         true <- valid_exp?(claims),
         sub when is_binary(sub) and sub != "" <- claims["sub"] do
      {:ok, sub}
    else
      _ -> {:error, :invalid}
    end
  end

  def verify(_), do: {:error, :invalid}

  defp valid_exp?(%{"exp" => exp}) when is_integer(exp) do
    exp > DateTime.to_unix(DateTime.utc_now())
  end

  defp valid_exp?(_), do: false
end
