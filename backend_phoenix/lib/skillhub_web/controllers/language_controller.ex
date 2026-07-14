defmodule SkillHubWeb.LanguageController do
  @moduledoc "Ported language-preference API (language.py) under /api/v1/language."
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  @defaults %{
    "preferred_language" => "en",
    "fallback_language" => "en",
    "date_format" => "MM/DD/YYYY",
    "time_format" => "12h",
    "timezone" => "UTC",
    "currency" => "USD",
    "number_format" => "en-US",
    "auto_translate" => false,
    "show_original_content" => true
  }

  @pref_fields ~w(preferred_language fallback_language date_format time_format timezone currency number_format auto_translate show_original_content)

  def supported(conn, _params) do
    languages =
      SQL.maps("""
      select code, name, native_name, direction, flag_emoji, is_beta, sort_order
      from public.supported_languages where is_active = true order by sort_order asc
      """)

    json(conn, %{success: true, data: %{languages: languages, total: length(languages)}})
  end

  def get_preference(conn, _params) do
    user_id = uid(conn)

    case SQL.one("select * from public.language_preferences where user_id = $1::uuid", [user_id]) do
      nil ->
        settings = SQL.one("select preferred_language, language from public.user_settings where user_id = $1::uuid", [user_id])
        fallback = (settings && (settings[:preferred_language] || settings[:language])) || "en"
        json(conn, %{success: true, data: Map.merge(defaults_map(user_id), %{"preferred_language" => fallback})})

      pref ->
        json(conn, %{success: true, data: pref_view(user_id, pref)})
    end
  end

  def save_preference(conn, params) do
    user_id = uid(conn)
    values = Enum.map(@pref_fields, fn f -> {f, Map.get(params, f, @defaults[f])} end) |> Map.new()

    upsert_preference(user_id, values)
    mirror_language(user_id, values["preferred_language"])

    json(conn, %{
      success: true,
      message: "Language preference saved successfully",
      data: %{user_id: user_id, preferred_language: values["preferred_language"]}
    })
  end

  def update_preference(conn, params) do
    user_id = uid(conn)
    updates = Map.take(params, @pref_fields) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

    if map_size(updates) == 0 do
      conn |> put_status(400) |> json(%{detail: "No fields to update"})
    else
      update_preference_row(user_id, updates)
      if updates["preferred_language"], do: mirror_language(user_id, updates["preferred_language"])
      json(conn, %{success: true, message: "Language preference updated successfully", data: updates})
    end
  end

  def user_settings(conn, _params) do
    user_id = uid(conn)

    data =
      SQL.one("select * from public.user_language_settings where user_id = $1::uuid", [user_id]) ||
        %{
          user_id: user_id,
          preferred_language: "en",
          language_name: "English",
          language_native_name: "English",
          text_direction: "ltr",
          flag_emoji: "🇺🇸"
        }

    json(conn, %{success: true, data: data})
  end

  def quick_change(conn, %{"language_code" => code}) do
    user_id = uid(conn)

    case SQL.one("select * from public.supported_languages where code = $1 and is_active = true", [code]) do
      nil ->
        conn |> put_status(400) |> json(%{detail: "Language code '#{code}' is not supported"})

      lang ->
        upsert_preference(user_id, %{"preferred_language" => code})
        mirror_language(user_id, code)

        json(conn, %{
          success: true,
          message: "Language changed to #{lang[:native_name]}",
          data: %{
            language_code: code,
            language_name: lang[:name],
            native_name: lang[:native_name],
            flag_emoji: lang[:flag_emoji]
          }
        })
    end
  end

  # --- helpers ---------------------------------------------------------------

  defp upsert_preference(user_id, values) do
    exists = SQL.one("select id from public.language_preferences where user_id = $1::uuid", [user_id])
    if exists, do: update_preference_row(user_id, values), else: insert_preference_row(user_id, values)
  end

  defp insert_preference_row(user_id, values) do
    cols = Map.keys(values)
    placeholders = Enum.map_join(2..(length(cols) + 1), ", ", &"$#{&1}")
    col_sql = Enum.join(cols, ", ")

    SQL.one(
      "insert into public.language_preferences (user_id, #{col_sql}, updated_at) " <>
        "values ($1::uuid, #{placeholders}, now()) returning id::text",
      [user_id | Enum.map(cols, &values[&1])]
    )
  end

  defp update_preference_row(user_id, values) do
    cols = Map.keys(values)
    set_sql = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)

    SQL.maps(
      "update public.language_preferences set #{set_sql}, updated_at = now() where user_id = $1::uuid returning id::text",
      [user_id | Enum.map(cols, &values[&1])]
    )
  end

  # Best-effort mirror to user_settings / user_profiles (as the Python does).
  defp mirror_language(user_id, code) do
    safe(fn ->
      SQL.maps(
        "update public.user_settings set preferred_language = $2, language = $2 where user_id = $1::uuid",
        [user_id, code]
      )
    end)

    safe(fn ->
      SQL.maps(
        "update public.user_profiles set preferred_language = $2 where user_id = $1::uuid",
        [user_id, code]
      )
    end)
  end

  defp pref_view(user_id, pref) do
    @defaults
    |> Enum.map(fn {k, default} -> {k, Map.get(pref, String.to_atom(k), default)} end)
    |> Map.new()
    |> Map.put("user_id", user_id)
    |> Map.put("updated_at", pref[:updated_at])
  end

  defp defaults_map(user_id), do: Map.put(@defaults, "user_id", user_id)

  defp safe(fun) do
    try do
      fun.()
    rescue
      _ -> :ok
    end
  end

  defp uid(conn), do: conn.assigns.current_user_id
end
