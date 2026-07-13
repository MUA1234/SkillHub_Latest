-- Migration 009: Seed Sri Lankan languages and prioritize the supported set.
--
-- The 007 migration created `supported_languages` and seeded a generic catalog
-- (en, es, fr, …) but never inserted Sinhala or Tamil. Phase C of the SkillHub
-- rollout ships full UI translations for English, Sinhala (සිංහල) and Tamil
-- (தமிழ்), so this migration:
--   1. Adds `si` and `ta`.
--   2. Pushes `si` and `ta` to the top of the language switcher (sort_order 1, 2).
--   3. Bumps `en` to sort_order 3 — it remains active and the global default.
--   4. Disables the other locales whose UI strings are not yet translated, so
--      the switcher doesn't expose half-finished languages to learners. Marking
--      them `is_active = false` keeps the rows around for later activation.
--
-- Idempotent: re-running won't duplicate rows or flip Sri Lankan languages off.

INSERT INTO public.supported_languages
  (code, name, native_name, direction, flag_emoji, sort_order, is_active, is_beta)
VALUES
  ('si', 'Sinhala', 'සිංහල', 'ltr', '🇱🇰', 1, TRUE, FALSE),
  ('ta', 'Tamil',   'தமிழ்',  'ltr', '🇱🇰', 2, TRUE, FALSE)
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  native_name = EXCLUDED.native_name,
  direction   = EXCLUDED.direction,
  flag_emoji  = EXCLUDED.flag_emoji,
  sort_order  = EXCLUDED.sort_order,
  is_active   = TRUE,
  is_beta     = FALSE;

-- Re-prioritize English to follow the local languages.
UPDATE public.supported_languages
SET    sort_order = 3,
       is_active  = TRUE
WHERE  code = 'en';

-- Deactivate locales without UI translations so the switcher only offers what
-- actually works end-to-end. Re-enable in a future migration as translations land.
UPDATE public.supported_languages
SET    is_active = FALSE
WHERE  code IN ('es','fr','de','zh','ja','ko','ar','hi','pt','ru','it');

-- A few seeded language_preferences rows from earlier sessions may carry the
-- pre-Phase-C `currency = 'USD'` / `number_format = 'en-US'` defaults. We do
-- NOT bulk-rewrite those here — currency is a per-user preference and Section
-- C5 of the README handles formatting at the UI layer. The default for *new*
-- rows still comes from the language_preferences DEFAULT clause.
