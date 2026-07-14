defmodule SkillHub.PDF do
  @moduledoc """
  HTML → PDF via headless Chrome's one-shot `--print-to-pdf`. Replaces the Python
  reportlab services. Chrome does the font shaping, so Sinhala/Tamil render
  correctly (the templates declare Noto/Nirmala fallbacks).

  We shell out to Chrome directly rather than driving it over the CDP
  remote-debugging pipe: the pipe transport relies on Unix file-descriptor
  redirection that does not translate to Windows, whereas `--print-to-pdf` is a
  self-contained render that works on every platform. Each render uses a private,
  throwaway user-data-dir so concurrent jobs never collide on Chrome's profile
  singleton lock, and never attach to a developer's already-open browser.
  """

  require Logger

  @standard_paths [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ]

  @doc "Resolve a Chrome/Edge executable (config → env → standard paths → PATH)."
  def chrome_executable do
    from_cfg = get_in(Application.get_env(:skillhub, :pdf, []), [:chrome_executable])

    (from_cfg && File.exists?(from_cfg) && from_cfg) ||
      (System.get_env("CHROME_BIN") |> present_file()) ||
      Enum.find(@standard_paths, &File.exists?/1) ||
      System.find_executable("chrome") || System.find_executable("chromium")
  end

  @doc "True when PDF rendering is available (a Chrome/Edge binary was found)."
  def available?, do: not is_nil(chrome_executable())

  @doc """
  Render an HTML string to a PDF binary. Returns `{:ok, binary}` | `{:error, reason}`.

  Orientation and page size come from the document's own `@page` CSS rule, so
  landscape certificates just declare `@page { size: A4 landscape }`. The
  `:landscape` opt is accepted for API symmetry but the stylesheet is
  authoritative.
  """
  def render(html, _opts \\ []) do
    case chrome_executable() do
      nil -> {:error, :unavailable}
      exe -> do_render(exe, html)
    end
  end

  defp do_render(exe, html) do
    base = Path.join(System.tmp_dir!(), "skillhub_pdf_#{token()}")
    html_file = base <> ".html"
    pdf_file = base <> ".pdf"
    profile = base <> "_prof"

    try do
      File.write!(html_file, html)

      args = [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--angle=swiftshader",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=#{profile}",
        "--no-pdf-header-footer",
        "--print-to-pdf=#{pdf_file}",
        "file:///" <> String.replace(html_file, "\\", "/")
      ]

      case System.cmd(exe, args, stderr_to_stdout: true) do
        {_out, 0} ->
          case File.read(pdf_file) do
            {:ok, bin} when byte_size(bin) > 200 ->
              {:ok, bin}

            {:ok, _} ->
              {:error, :empty_pdf}

            {:error, reason} ->
              Logger.error("PDF render: chrome exited 0 but no output file (#{inspect(reason)})")
              {:error, reason}
          end

        {out, code} ->
          Logger.error("PDF render: chrome exit #{code}: #{String.slice(out, 0, 500)}")
          {:error, {:chrome_exit, code}}
      end
    rescue
      e ->
        Logger.error("PDF render crashed: #{Exception.message(e)}")
        {:error, e}
    after
      File.rm(html_file)
      File.rm(pdf_file)
      File.rm_rf(profile)
    end
  end

  defp token, do: :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)

  defp present_file(nil), do: nil
  defp present_file(path), do: File.exists?(path) && path
end
