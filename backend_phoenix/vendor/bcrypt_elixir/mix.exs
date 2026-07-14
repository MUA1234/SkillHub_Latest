defmodule BcryptElixir.MixProject do
  use Mix.Project

  # Vendored bcrypt_elixir 3.3.2 that builds its NIF with `zig cc` instead of
  # MSVC/nmake. Reason: this Windows box has no C toolchain (the VS Build Tools
  # lack the Windows SDK / UCRT headers and the elevated installer was declined),
  # but zig ships a self-contained clang + libc, so it compiles the NIF with no
  # admin rights. The `enif_*` symbols resolve via erl_nif's runtime callback
  # table, so no Erlang import library is needed — a plain `-shared` DLL loads.
  def project do
    [
      app: :bcrypt_elixir,
      version: "3.3.2",
      elixir: "~> 1.14",
      compilers: [:bcrypt_zig] ++ Mix.compilers(),
      deps: deps()
    ]
  end

  def application, do: [extra_applications: [:logger, :crypto]]

  defp deps, do: [{:comeonin, "~> 5.3"}]
end

defmodule Mix.Tasks.Compile.BcryptZig do
  @moduledoc false
  use Mix.Task.Compiler

  @impl true
  def run(_args) do
    priv = Path.join(Mix.Project.app_path(), "priv")
    File.mkdir_p!(priv)
    dll = Path.join(priv, "bcrypt_nif.dll")

    sources = ["c_src/bcrypt_nif.c", "c_src/blowfish.c"]
    newest_src = sources |> Enum.map(&mtime/1) |> Enum.max()

    if not File.exists?(dll) or mtime(dll) < newest_src do
      zig = zig_bin()
      erts_include = Path.join([to_string(:code.root_dir()), "erts-#{:erlang.system_info(:version)}", "include"])

      args =
        ["cc", "-O2", "-shared", "-Wall", "-Wno-format-truncation",
         "-I#{erts_include}", "-Ic_src", "-o", dll] ++ sources

      Mix.shell().info("Compiling bcrypt NIF with zig cc → #{Path.relative_to_cwd(dll)}")

      case System.cmd(zig, args, stderr_to_stdout: true) do
        {_out, 0} -> :ok
        {out, code} -> Mix.raise("zig cc failed (#{code}):\n#{out}")
      end
    end

    :ok
  end

  defp mtime(path) do
    case File.stat(path, time: :posix) do
      {:ok, %{mtime: m}} -> m
      _ -> 0
    end
  end

  defp zig_bin do
    home = System.user_home!()

    candidates =
      [System.find_executable("zig"),
       Path.join([home, "scoop", "apps", "zig", "current", "zig.exe"]),
       Path.join([home, "scoop", "shims", "zig.exe"])]

    Enum.find(candidates, &(&1 && File.exists?(&1))) || Mix.raise("zig not found on PATH")
  end
end
