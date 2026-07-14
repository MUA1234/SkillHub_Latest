defmodule SkillHubWeb.ExamController do
  @moduledoc """
  Ported quiz/exam system (exams.py). Teacher CRUD + submissions and the student
  take-flow (list → detail → start → submit → results) with MCQ/true-false
  auto-grading and short-answer flagged for manual review. `correct_answer` is
  stripped before any student-facing serialization.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  # ---- Teacher side ---------------------------------------------------------

  def list_teacher_exams(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      {sql, args} =
        case params["course_id"] do
          nil ->
            {"select to_jsonb(e) as row from public.examinations e where e.teacher_id = $1::uuid order by e.created_at desc", [tp]}

          cid ->
            {"select to_jsonb(e) as row from public.examinations e where e.teacher_id = $1::uuid and e.course_id = $2::uuid order by e.created_at desc", [tp, cid]}
        end

      json(conn, %{success: true, exams: SQL.json_all(sql, args)})
    end
  end

  def create_exam(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      questions = params["questions"] || []
      total_marks = total_marks(questions)
      available_from = params["available_from"]
      exam_date = available_from || DateTime.to_iso8601(DateTime.utc_now())

      id =
        SQL.scalar(
          """
          insert into public.examinations
            (course_id, teacher_id, title, description, instructions, exam_date, duration_minutes,
             total_marks, passing_marks, attempts_allowed, randomize_questions, accepts_short_answer,
             available_from, available_until, questions, is_published, status, created_at)
          values ($1::uuid, $2::uuid, $3, $4, $5, $6::text::timestamp, $7, $8, $9, $10, $11, $12,
                  $13::text::timestamp, $14::text::timestamp, $15::text::jsonb, false, 'draft', now())
          returning id::text
          """,
          [
            params["course_id"], tp, params["title"], params["description"], params["instructions"],
            exam_date, params["duration_minutes"] || 30, total_marks, params["passing_marks"],
            params["attempts_allowed"] || 1, params["randomize_questions"] || false,
            params["accepts_short_answer"] || false, available_from, params["available_until"],
            Jason.encode!(questions)
          ]
        )

      json(conn, %{success: true, exam: fetch_exam(id)})
    end
  end

  def get_teacher_exam(conn, %{"exam_id" => exam_id}) do
    with {:ok, tp} <- teacher_profile(conn),
         %{} = exam <- owned_exam(exam_id, tp) do
      json(conn, %{success: true, exam: exam})
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  def update_exam(conn, %{"exam_id" => exam_id} = params) do
    with {:ok, tp} <- teacher_profile(conn),
         %{} <- owned_exam(exam_id, tp) do
      {set, args} = build_updates(params)

      if set == [] do
        json(conn, %{success: true})
      else
        assignments = set |> Enum.with_index(1) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}#{cast(c)}" end)
        idx = length(args) + 1
        SQL.maps("update public.examinations set #{assignments} where id = $#{idx}::uuid", args ++ [exam_id])
        json(conn, %{success: true})
      end
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  def delete_exam(conn, %{"exam_id" => exam_id}) do
    with {:ok, tp} <- teacher_profile(conn),
         %{} <- owned_exam(exam_id, tp) do
      SQL.maps("delete from public.examinations where id = $1::uuid", [exam_id])
      json(conn, %{success: true})
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  def list_submissions(conn, %{"exam_id" => exam_id}) do
    with {:ok, tp} <- teacher_profile(conn),
         %{} <- owned_exam(exam_id, tp) do
      submissions =
        SQL.json_all(
          """
          select to_jsonb(r) || jsonb_build_object('student_name',
            nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')) as row
          from public.examination_results r
          left join public.user_profiles p on p.user_id = r.student_id
          where r.exam_id = $1::uuid
          order by r.submitted_at desc nulls last
          """,
          [exam_id]
        )
        |> Enum.map(fn s -> Map.update(s, "student_name", "Student", &(&1 || "Student")) end)

      json(conn, %{success: true, submissions: submissions})
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  # ---- Student side ---------------------------------------------------------

  def list_student_exams(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      course_ids =
        SQL.maps(
          "select course_id::text from public.course_enrollments where student_id = $1::uuid and (status is null or status in ('active','completed')) and course_id is not null",
          [user_id]
        )
        |> Enum.map(& &1.course_id)

      course_ids =
        case params["course_id"] do
          nil -> course_ids
          cid -> if cid in course_ids, do: [cid], else: []
        end

      exams =
        if course_ids == [] do
          []
        else
          SQL.json_all(
            """
            select to_jsonb(e) - 'questions' - 'teacher_id' as row from public.examinations e
            where e.is_published = true and e.course_id = any($1::uuid[])
            order by e.created_at desc
            """,
            [course_ids]
          )
        end

      json(conn, %{success: true, exams: exams})
    end
  end

  def get_student_exam(conn, %{"exam_id" => exam_id}) do
    with {:ok, _} <- require_role(conn, "student"),
         %{} = exam <- published_exam(exam_id),
         :ok <- enrolled?(uid(conn), exam["course_id"]) do
      user_id = uid(conn)
      accom = accommodations(user_id, exam["course_id"])

      prior =
        SQL.json_all(
          """
          select to_jsonb(r) - 'student_answers' as row from public.examination_results r
          where r.exam_id = $1::uuid and r.student_id = $2::uuid order by r.attempt_number desc
          """,
          [exam_id, user_id]
        )

      json(conn, %{
        success: true,
        exam: sanitize_for_student(exam),
        accommodations: accom,
        prior_attempts: prior,
        attempts_allowed: exam["attempts_allowed"] || 1
      })
    else
      nil -> not_found(conn)
      :not_enrolled -> forbidden(conn, "Not enrolled in this course.")
      other -> other
    end
  end

  def start_exam(conn, %{"exam_id" => exam_id}) do
    with {:ok, _} <- require_role(conn, "student"),
         %{} = exam <- published_exam(exam_id),
         :ok <- enrolled?(uid(conn), exam["course_id"]) do
      user_id = uid(conn)

      completed =
        SQL.scalar(
          "select count(*)::int from public.examination_results where exam_id = $1::uuid and student_id = $2::uuid and status in ('submitted','graded')",
          [exam_id, user_id], 0
        )

      if completed >= (exam["attempts_allowed"] || 1) do
        conn |> put_status(400) |> json(%{detail: "No attempts remaining."})
      else
        snapshot = accommodations(user_id, exam["course_id"])

        id =
          SQL.scalar(
            """
            insert into public.examination_results
              (exam_id, student_id, status, attempt_number, started_at, accommodations_applied, student_answers, created_at)
            values ($1::uuid, $2::uuid, 'in_progress', $3, now(), $4::text::jsonb, '{}'::jsonb, now())
            returning id::text
            """,
            [exam_id, user_id, completed + 1, Jason.encode!(snapshot)]
          )

        json(conn, %{success: true, attempt: fetch_result(id), accommodations: snapshot})
      end
    else
      nil -> not_found(conn)
      :not_enrolled -> forbidden(conn, "Not enrolled in this course.")
      other -> other
    end
  end

  def submit_exam(conn, %{"exam_id" => exam_id} = params) do
    with {:ok, _} <- require_role(conn, "student"),
         %{} = exam <- published_exam(exam_id) do
      user_id = uid(conn)
      answers = params["answers"] || %{}

      attempt =
        SQL.json_one(
          "select to_jsonb(r) as row from public.examination_results r where r.exam_id = $1::uuid and r.student_id = $2::uuid and r.status = 'in_progress' order by r.started_at desc limit 1",
          [exam_id, user_id]
        ) || create_attempt(exam_id, user_id)

      grade = grade_attempt(exam["questions"] || [], answers)
      passing = exam["passing_marks"] || 0
      is_passed = if passing > 0, do: grade.marks_obtained >= passing, else: nil
      status = if grade.needs_review, do: "needs_review", else: "graded"
      elapsed = elapsed_seconds(attempt["started_at"])

      SQL.maps(
        """
        update public.examination_results set
          student_answers = $2::text::jsonb, marks_obtained = $3, percentage = $4, is_passed = $5,
          status = $6, submitted_at = now(), time_taken_seconds = $7
        where id = $1::uuid
        """,
        [attempt["id"], Jason.encode!(answers), grade.marks_obtained, grade.percentage, is_passed, status, elapsed]
      )

      json(conn, %{
        success: true,
        result: %{
          attempt_id: attempt["id"],
          total_marks: grade.total_marks,
          marks_obtained: grade.marks_obtained,
          percentage: grade.percentage,
          is_passed: is_passed,
          needs_review: grade.needs_review,
          feedback: grade.feedback
        }
      })
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  def my_results(conn, %{"exam_id" => exam_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      attempts =
        SQL.json_all(
          "select to_jsonb(r) as row from public.examination_results r where r.exam_id = $1::uuid and r.student_id = $2::uuid order by r.attempt_number desc",
          [exam_id, uid(conn)]
        )

      json(conn, %{success: true, attempts: attempts})
    end
  end

  # ---- helpers --------------------------------------------------------------

  defp teacher_profile(conn) do
    with {:ok, _user} <- require_role(conn, "teacher") do
      case SQL.one("select id::text from public.teacher_profiles where user_id = $1::uuid", [uid(conn)]) do
        nil -> {:error, conn |> put_status(404) |> json(%{detail: "Teacher profile not set up yet."})}
        %{id: id} -> {:ok, id}
      end
    end
  end

  defp owned_exam(exam_id, tp) do
    case fetch_exam(exam_id) do
      %{"teacher_id" => ^tp} = exam -> exam
      _ -> nil
    end
  end

  defp fetch_exam(id), do: SQL.json_one("select to_jsonb(e) as row from public.examinations e where e.id = $1::uuid", [id])
  defp fetch_result(id), do: SQL.json_one("select to_jsonb(r) as row from public.examination_results r where r.id = $1::uuid", [id])

  defp published_exam(exam_id) do
    case fetch_exam(exam_id) do
      %{"is_published" => true} = exam -> exam
      _ -> nil
    end
  end

  defp enrolled?(user_id, course_id) do
    case SQL.one("select id from public.course_enrollments where student_id = $1::uuid and course_id = $2::uuid limit 1", [user_id, course_id]) do
      nil -> :not_enrolled
      _ -> :ok
    end
  end

  defp accommodations(user_id, course_id) do
    a = SQL.json_one("select to_jsonb(a) as row from public.student_course_accommodations a where a.student_id = $1::uuid and a.course_id = $2::uuid", [user_id, course_id]) || %{}

    %{
      extended_time_percentage: a["extended_time_percentage"] || 0,
      large_print: !!a["large_print"],
      audio_version: !!a["audio_version"],
      simplified_content: !!a["simplified_content"]
    }
  end

  defp create_attempt(exam_id, user_id) do
    id =
      SQL.scalar(
        "insert into public.examination_results (exam_id, student_id, status, attempt_number, started_at, accommodations_applied, student_answers, created_at) values ($1::uuid, $2::uuid, 'in_progress', 1, now(), '{}'::jsonb, '{}'::jsonb, now()) returning id::text",
        [exam_id, user_id]
      )

    fetch_result(id)
  end

  defp sanitize_for_student(exam) do
    questions =
      (exam["questions"] || [])
      |> Enum.map(fn q ->
        base = %{"id" => q["id"], "type" => q["type"], "prompt" => q["prompt"], "marks" => q["marks"]}
        if q["options"], do: Map.put(base, "options", q["options"]), else: base
      end)

    exam
    |> Map.take(~w(id course_id title description instructions duration_minutes total_marks passing_marks attempts_allowed available_from available_until randomize_questions))
    |> Map.put("questions", questions)
  end

  defp grade_attempt(questions, answers) do
    {total, obtained, needs_review, feedback} =
      Enum.reduce(questions, {0, 0, false, []}, fn q, {tot, obt, nr, fb} ->
        qid = q["id"]
        qmarks = to_int(q["marks"])
        student = answers[qid]

        case q["type"] do
          type when type in ["mcq", "true_false"] ->
            correct? = correct?(q["correct_answer"], student)
            {tot + qmarks, obt + if(correct?, do: qmarks, else: 0), nr,
             fb ++ [%{question_id: qid, correct: correct?, marks_awarded: if(correct?, do: qmarks, else: 0), explanation: q["explanation"]}]}

          "short_answer" ->
            {tot + qmarks, obt, true, fb ++ [%{question_id: qid, needs_review: true, marks_awarded: 0, explanation: q["explanation"]}]}

          _ ->
            {tot + qmarks, obt, nr, fb ++ [%{question_id: qid, skipped: true}]}
        end
      end)

    percentage = if total > 0, do: Float.round(obtained / total * 100, 2), else: 0.0
    %{total_marks: total, marks_obtained: obtained, percentage: percentage, needs_review: needs_review, feedback: feedback}
  end

  defp correct?(correct, student) when is_list(correct) do
    is_list(student) and Enum.sort(Enum.map(student, &to_string/1)) == Enum.sort(Enum.map(correct, &to_string/1))
  end

  defp correct?(correct, student), do: String.trim(to_string(student || "")) == String.trim(to_string(correct || ""))

  defp build_updates(params) do
    fields = ~w(title description instructions duration_minutes passing_marks attempts_allowed randomize_questions accepts_short_answer available_from available_until)

    {cols, args} =
      Enum.reduce(fields, {[], []}, fn f, {c, a} ->
        if Map.has_key?(params, f) and not is_nil(params[f]), do: {c ++ [f], a ++ [params[f]]}, else: {c, a}
      end)

    {cols, args} =
      if is_list(params["questions"]) do
        {cols ++ ["questions", "total_marks"], args ++ [Jason.encode!(params["questions"]), total_marks(params["questions"])]}
      else
        {cols, args}
      end

    {cols2, args2} =
      case params["is_published"] do
        true -> {cols ++ ["is_published", "status"], args ++ [true, "published"]}
        false -> {cols ++ ["is_published", "status"], args ++ [false, "draft"]}
        _ -> {cols, args}
      end

    {cols2, args2}
  end

  defp total_marks(questions), do: Enum.reduce(questions, 0, fn q, acc -> acc + to_int(q["marks"] || q[:marks]) end)

  # Per-column casts for the dynamic UPDATE set-clause.
  defp cast("questions"), do: "::text::jsonb"
  defp cast("available_from"), do: "::text::timestamp"
  defp cast("available_until"), do: "::text::timestamp"
  defp cast(_), do: ""

  defp elapsed_seconds(nil), do: nil
  defp elapsed_seconds(started) do
    case DateTime.from_iso8601(String.replace(started, " ", "T") <> tz_suffix(started)) do
      {:ok, dt, _} -> DateTime.diff(DateTime.utc_now(), dt)
      _ -> nil
    end
  end

  defp tz_suffix(s), do: if(String.contains?(s, "+") or String.ends_with?(s, "Z"), do: "", else: "Z")
  defp to_int(nil), do: 0
  defp to_int(n) when is_integer(n), do: n
  defp to_int(n) when is_binary(n), do: (case Integer.parse(n) do
    {i, _} -> i
    :error -> 0
  end)
  defp to_int(_), do: 0

  defp uid(conn), do: conn.assigns.current_user_id
  defp not_found(conn), do: conn |> put_status(404) |> json(%{detail: "Exam not found."})
  defp forbidden(conn, msg), do: conn |> put_status(403) |> json(%{detail: msg})
end
