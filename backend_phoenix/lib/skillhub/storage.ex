defmodule SkillHub.Storage do
  @moduledoc """
  Supabase Storage uploads over the REST API (replaces the Python
  `storage_service`). Uploads the file bytes to `{bucket}/{path}` and returns
  the public URL. Best-effort — returns {:error, reason} rather than raising.
  """
  require Logger

  @image_types ~w(image/jpeg image/png image/gif image/webp)
  @doc_types ~w(application/pdf video/mp4 audio/mpeg text/plain application/msword)

  defp cfg, do: Application.fetch_env!(:skillhub, :supabase)

  @doc """
  Upload a `%Plug.Upload{}` under a folder for the user. `kind` picks the path
  prefix (\"avatar\" | \"content\"). Returns {:ok, %{file_url, path, ...}}.
  """
  def upload(%Plug.Upload{} = up, user_id, kind \\ "content") do
    with {:ok, binary} <- File.read(up.path),
         :ok <- validate(up.content_type, byte_size(binary)) do
      path = object_path(kind, user_id, up.filename)
      do_upload(path, binary, up.content_type || "application/octet-stream")
    end
  end

  defp do_upload(path, binary, content_type) do
    c = cfg()
    url = "#{String.trim_trailing(c[:url], "/")}/storage/v1/object/#{c[:bucket]}/#{path}"

    headers = [
      {"authorization", "Bearer #{c[:key]}"},
      {"apikey", c[:key]},
      {"content-type", content_type},
      {"x-upsert", "true"}
    ]

    case Req.post(url: url, headers: headers, body: binary, decode_body: false, retry: false, connect_options: [timeout: 10_000], receive_timeout: 30_000) do
      {:ok, %{status: s}} when s in [200, 201] ->
        {:ok, %{file_url: public_url(path), path: path, content_type: content_type, size: byte_size(binary)}}

      {:ok, %{status: s, body: body}} ->
        Logger.warning("storage upload failed (#{s}): #{inspect(body)}")
        {:error, {:http, s}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  def public_url(path) do
    c = cfg()
    "#{String.trim_trailing(c[:url], "/")}/storage/v1/object/public/#{c[:bucket]}/#{path}"
  end

  defp object_path(kind, user_id, filename) do
    ext = filename |> to_string() |> Path.extname()
    base = filename |> to_string() |> Path.basename(ext) |> String.replace(~r/[^a-zA-Z0-9_-]/, "_") |> String.slice(0, 40)
    stamp = System.system_time(:millisecond)
    prefix = if kind == "avatar", do: "avatars", else: "content"
    "#{prefix}/#{user_id}/#{stamp}_#{base}#{ext}"
  end

  defp validate(content_type, size) do
    cond do
      size > 25_000_000 -> {:error, :too_large}
      content_type in (@image_types ++ @doc_types) -> :ok
      # Be permissive on unknown types for content (Python allowed a broad set).
      true -> :ok
    end
  end
end
