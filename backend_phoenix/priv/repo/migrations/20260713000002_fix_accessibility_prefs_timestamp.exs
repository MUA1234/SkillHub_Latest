defmodule SkillHub.Repo.Migrations.FixAccessibilityPrefsTimestamp do
  @moduledoc """
  `accessibility_preferences` has a BEFORE UPDATE trigger
  (`update_accessibility_prefs_timestamp` → `update_accessibility_timestamp()`)
  that assigns `NEW.updated_at`, but the table only ever had `last_modified`.
  Every UPDATE therefore errored with "record \"new\" has no field
  \"updated_at\"" — which the Python backend never noticed because its writes
  ran through the no-op SQLAlchemy shim. Add the missing column (additive,
  idempotent) so updates succeed and the trigger keeps it fresh.
  """
  use Ecto.Migration

  def up do
    execute "ALTER TABLE public.accessibility_preferences ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP"
  end

  def down do
    execute "ALTER TABLE public.accessibility_preferences DROP COLUMN IF EXISTS updated_at"
  end
end
