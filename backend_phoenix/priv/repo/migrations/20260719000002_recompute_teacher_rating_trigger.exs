defmodule SkillHub.Repo.Migrations.RecomputeTeacherRatingTrigger do
  @moduledoc """
  `teacher_profiles.average_rating` / `.total_reviews` are read everywhere
  (profile stats, student "find teachers" search/sort, sponsor teacher
  browsing) but nothing anywhere ever wrote them — no review-submission
  endpoint existed in either backend despite a real `reviews` table already
  being in the schema. Every teacher's rating was permanently stuck at the
  column default (0).

  Rather than recompute inline in every write path (Phoenix now, potentially
  Python later), keep it correct at the data layer: a trigger on `reviews`
  recalculates the owning teacher's aggregate on any insert/update/delete.
  """
  use Ecto.Migration

  def up do
    execute """
    CREATE OR REPLACE FUNCTION public.recompute_teacher_rating() RETURNS trigger AS $$
    DECLARE
      tid uuid;
    BEGIN
      tid := COALESCE(NEW.teacher_id, OLD.teacher_id);
      IF tid IS NOT NULL THEN
        UPDATE public.teacher_profiles
        SET average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE teacher_id = tid), 0),
            total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE teacher_id = tid)
        WHERE id = tid;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
    """

    execute "DROP TRIGGER IF EXISTS reviews_recompute_teacher_rating ON public.reviews;"

    execute """
    CREATE TRIGGER reviews_recompute_teacher_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.recompute_teacher_rating();
    """
  end

  def down do
    execute "DROP TRIGGER IF EXISTS reviews_recompute_teacher_rating ON public.reviews;"
    execute "DROP FUNCTION IF EXISTS public.recompute_teacher_rating();"
  end
end
