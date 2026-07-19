defmodule SkillHub.MixProject do
  use Mix.Project

  def project do
    [
      app: :skillhub,
      version: "0.1.0",
      elixir: "~> 1.17",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      listeners: [Phoenix.CodeReloader]
    ]
  end

  # Configuration for the OTP application.
  #
  # Type `mix help compile.app` for more information.
  def application do
    [
      mod: {SkillHub.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  def cli do
    [
      preferred_envs: [precommit: :test]
    ]
  end

  # Specifies which paths to compile per environment.
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # Specifies your project dependencies.
  #
  # Type `mix help deps` for examples and options.
  defp deps do
    [
      {:phoenix, "~> 1.8.9"},
      {:phoenix_ecto, "~> 4.5"},
      {:ecto_sql, "~> 3.13"},
      {:postgrex, ">= 0.0.0"},
      {:telemetry_metrics, "~> 1.0"},
      {:telemetry_poller, "~> 1.0"},
      {:jason, "~> 1.2"},
      {:dns_cluster, "~> 0.2.0"},
      {:bandit, "~> 1.5"},
      {:joken, "~> 2.6"},
      {:req, "~> 0.5"},
      {:cors_plug, "~> 3.0"},
      {:swoosh, "~> 1.16"},
      {:gen_smtp, "~> 1.2"},
      {:elixlsx, "~> 0.6.0"},
      bcrypt_dep()
    ]
  end

  # bcrypt selection is OS-dependent:
  #  * Windows dev box has no C toolchain, so it uses the vendored copy that
  #    builds its NIF with `zig cc` (produces bcrypt_nif.dll).
  #  * Linux (Docker / prod) has cc, so it uses the Hex package, which builds
  #    a normal .so via elixir_make.
  # Both emit $2b$ hashes, so existing passlib-hashed passwords keep working.
  defp bcrypt_dep do
    case :os.type() do
      {:win32, _} -> {:bcrypt_elixir, path: "vendor/bcrypt_elixir", override: true}
      _ -> {:bcrypt_elixir, "~> 3.3", override: true}
    end
  end

  # Aliases are shortcuts or tasks specific to the current project.
  # For example, to install project dependencies and perform other setup tasks, run:
  #
  #     $ mix setup
  #
  # See the documentation for `Mix` for more info on aliases.
  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      "ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"],
      precommit: ["compile --warnings-as-errors", "deps.unlock --unused", "format", "test"]
    ]
  end
end
