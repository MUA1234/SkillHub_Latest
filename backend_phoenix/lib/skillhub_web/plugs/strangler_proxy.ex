defmodule SkillHubWeb.Plugs.StranglerProxy do
  @moduledoc """
  Strangler-fig gateway. Requests for routes Phoenix has natively ported pass
  straight through to the router; everything else is reverse-proxied to the
  Python/FastAPI service, byte-for-byte.

  This plug runs BEFORE `Plug.Parsers`, so the raw request body (including
  multipart file uploads) is forwarded untouched. As modules are ported to
  Phoenix, add them to `native?/1` and delete the corresponding Python routes.
  """
  @behaviour Plug
  import Plug.Conn
  require Logger

  # Request/response hop-by-hop headers that must not be forwarded.
  @hop_by_hop ~w(host content-length connection keep-alive transfer-encoding upgrade proxy-authenticate proxy-authorization te trailer)

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    if native?(conn), do: conn, else: proxy(conn)
  end

  # --- which routes Phoenix owns natively (everything else → Python) ---------
  #
  # Derived straight from the router: if `SkillHubWeb.Router` has a matching
  # route the request is served natively; otherwise it's proxied to Python. So
  # porting a module is just adding its routes — nothing to maintain here.

  defp native?(conn) do
    case Phoenix.Router.route_info(SkillHubWeb.Router, conn.method, conn.request_path, conn.host) do
      :error -> false
      _ -> true
    end
  end

  # --- proxy -----------------------------------------------------------------

  defp proxy(conn) do
    {:ok, body, conn} = read_full_body(conn)
    url = target_url(conn)

    result =
      Req.request(
        method: conn.method |> String.downcase() |> String.to_atom(),
        url: url,
        headers: forward_req_headers(conn),
        body: body,
        decode_body: false,
        redirect: false,
        retry: false,
        connect_options: [timeout: 10_000],
        receive_timeout: 60_000
      )

    case result do
      {:ok, resp} ->
        send_upstream(conn, resp)

      {:error, reason} ->
        Logger.error("strangler proxy to #{url} failed: #{inspect(reason)}")

        conn
        |> put_resp_content_type("application/json")
        |> send_resp(502, Jason.encode!(%{detail: "Upstream service unavailable"}))
        |> halt()
    end
  end

  defp target_url(conn) do
    base = Application.fetch_env!(:skillhub, :python_backend)[:base_url] |> String.trim_trailing("/")
    query = if conn.query_string in [nil, ""], do: "", else: "?" <> conn.query_string
    base <> conn.request_path <> query
  end

  defp forward_req_headers(conn) do
    Enum.reject(conn.req_headers, fn {k, _v} -> String.downcase(k) in @hop_by_hop end)
  end

  defp send_upstream(conn, resp) do
    conn
    |> merge_upstream_headers(resp.headers)
    |> send_resp(resp.status, resp.body || "")
    |> halt()
  end

  # Copy upstream response headers, minus hop-by-hop and CORS (cors_plug already
  # set CORS on our side — duplicating them breaks the browser).
  defp merge_upstream_headers(conn, headers) do
    Enum.reduce(headers, conn, fn {k, v}, acc ->
      key = String.downcase(k)
      value = if is_list(v), do: Enum.join(v, ", "), else: v

      cond do
        key in @hop_by_hop -> acc
        String.starts_with?(key, "access-control-") -> acc
        true -> put_resp_header(acc, key, value)
      end
    end)
  end

  defp read_full_body(conn, acc \\ []) do
    case read_body(conn, length: 8_000_000, read_length: 1_000_000) do
      {:ok, chunk, conn} -> {:ok, IO.iodata_to_binary(Enum.reverse([chunk | acc])), conn}
      {:more, chunk, conn} -> read_full_body(conn, [chunk | acc])
      {:error, _reason} -> {:ok, IO.iodata_to_binary(Enum.reverse(acc)), conn}
    end
  end
end
