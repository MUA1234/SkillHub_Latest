defmodule SkillHubWeb.AccessibilityController do
  @moduledoc """
  Ported accessibility endpoints (accessibility.py). Covers the hot path —
  reading and writing `accessibility_preferences` (used on every page load) —
  plus presets, guardian-links read, onboarding status, and the disability
  profile read. Several of these were no-ops in Python (they ran through the
  SQLAlchemy shim); the port makes them actually persist. The mixed array/jsonb
  writes (teacher-specialization, disability-profile POST), the guardian-invite
  email, and the static disability-types list stay proxied to Python.
  """
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  # Writable scalar columns of accessibility_preferences (mirrors the pydantic
  # model). Whitelisted so client-supplied keys can never inject SQL.
  @pref_cols ~w(
    font_family font_size font_weight letter_spacing word_spacing line_height
    color_scheme background_color text_color link_color highlight_color
    color_blind_mode color_blind_strength high_contrast contrast_level brightness_level
    invert_colors reduced_motion disable_animations disable_auto_play disable_parallax
    simplified_ui large_click_targets sticky_navigation breadcrumbs_enabled reading_mode
    reading_guide reading_ruler text_mask focus_highlight screen_reader_optimized
    text_to_speech tts_voice tts_speed tts_pitch audio_descriptions auto_captions
    sign_language_videos simplified_language visual_learning_mode step_by_step_mode
    focus_mode break_reminders break_interval_minutes progress_indicators chunked_content
    cognitive_load_indicator keyboard_navigation voice_input switch_access touch_accommodations
    extended_time_default math_visualization calculator_always_visible number_line_helper
    step_by_step_math spell_check_enhanced grammar_suggestions word_prediction speech_to_text
    quiet_mode notification_sounds visual_notifications haptic_feedback active_preset
  )

  def get_disability_profile(conn, _params) do
    case SQL.json_one("select to_jsonb(p) as row from public.student_disability_profiles p where p.user_id = $1::uuid", [uid(conn)]) do
      nil -> json(conn, %{success: true, profile: nil, message: "No disability profile found. Please complete onboarding."})
      profile -> json(conn, %{success: true, profile: profile})
    end
  end

  def get_preferences(conn, _params) do
    prefs =
      SQL.json_one("select to_jsonb(a) as row from public.accessibility_preferences a where a.user_id = $1::uuid", [uid(conn)]) ||
        SQL.json_one("insert into public.accessibility_preferences (user_id) values ($1::uuid) returning to_jsonb(accessibility_preferences) as row", [uid(conn)])

    json(conn, %{success: true, preferences: prefs})
  end

  def save_preferences(conn, params), do: write_preferences(conn, params, log: false)
  def update_preferences(conn, params), do: write_preferences(conn, params, log: true)

  def get_presets(conn, params) do
    {sql, args} =
      case params["disability_type"] do
        nil ->
          {"select to_jsonb(p) as row from public.accessibility_presets p where p.is_system_preset = true order by p.usage_count desc, p.name", []}

        dt ->
          {"select to_jsonb(p) as row from public.accessibility_presets p where p.is_system_preset = true and (p.disability_type = $1 or p.disability_type is null) order by p.name", [dt]}
      end

    json(conn, %{success: true, presets: SQL.json_all(sql, args)})
  end

  def guardian_links(conn, _params) do
    links =
      SQL.json_all("select to_jsonb(l) as row from public.guardian_links l where l.student_id = $1::uuid and l.is_active = true order by l.created_at desc", [uid(conn)])
      |> Enum.map(&Map.delete(&1, "verification_code"))

    json(conn, %{success: true, guardian_links: links})
  end

  def onboarding_status(conn, _params) do
    row = SQL.one("select onboarding_completed from public.student_disability_profiles where user_id = $1::uuid limit 1", [uid(conn)])
    json(conn, %{success: true, onboarding_completed: (row && row.onboarding_completed) || false, has_profile: not is_nil(row)})
  end

  # ---- helpers --------------------------------------------------------------

  defp write_preferences(conn, params, opts) do
    user_id = uid(conn)
    updates = Map.take(params, @pref_cols) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

    if map_size(updates) == 0 do
      json(conn, %{success: true, message: "No updates provided"})
    else
      exists = SQL.one("select id from public.accessibility_preferences where user_id = $1::uuid", [user_id])
      cols = Map.keys(updates)

      if exists do
        set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
        SQL.maps("update public.accessibility_preferences set #{set}, last_modified = now() where user_id = $1::uuid", [user_id | Enum.map(cols, &updates[&1])])
      else
        ph = Enum.map_join(2..(length(cols) + 1), ", ", &"$#{&1}")
        SQL.maps("insert into public.accessibility_preferences (user_id, #{Enum.join(cols, ", ")}) values ($1::uuid, #{ph})", [user_id | Enum.map(cols, &updates[&1])])
      end

      if opts[:log], do: log_usage(user_id, updates)
      json(conn, %{success: true, message: "Preferences saved successfully"})
    end
  end

  defp log_usage(user_id, updates) do
    Enum.each(updates, fn {k, v} ->
      try do
        SQL.maps(
          "insert into public.accessibility_usage_logs (user_id, feature_name, action, new_value) values ($1::uuid, $2, 'updated', $3)",
          [user_id, k, to_string(v)]
        )
      rescue
        _ -> :ok
      end
    end)
  end

  defp uid(conn), do: conn.assigns.current_user_id
end
