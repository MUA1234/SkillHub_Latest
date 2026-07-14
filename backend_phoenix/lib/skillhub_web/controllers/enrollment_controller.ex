defmodule SkillHubWeb.EnrollmentController do
  @moduledoc """
  Ported session enrollment (session_enrollment.py) under /api/v1/enrollments.

  Fixes two latent bugs in the Python original: it queried a non-existent table
  (`live_live_session_enrollment_requests`) so every route 500'd, and its
  teacher-authorization compared `live_sessions.teacher_id` (a teacher_profiles
  id) against the user id. Here we use the real table and authorize the teacher
  by resolving their profile id (accepting either id form defensively).
  """
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  @enrollment_cols "id::text, session_id::text, student_id::text, status, request_message, teacher_response, requested_at, responded_at, created_at, updated_at"

  def enroll(conn, %{"session_id" => session_id} = params) do
    student_id = uid(conn)

    with {:ok, session} <- load_session(session_id) do
      existing =
        SQL.one(
          "select status from public.live_session_enrollment_requests where session_id = $1::uuid and student_id = $2::uuid",
          [session_id, student_id]
        )

      cond do
        existing ->
          conn |> put_status(400) |> json(%{detail: "You already have a #{existing.status} enrollment request for this session"})

        true ->
          enrollment =
            SQL.one(
              "insert into public.live_session_enrollment_requests (session_id, student_id, status, request_message) " <>
                "values ($1::uuid, $2::uuid, 'pending', $3) returning #{@enrollment_cols}",
              [session_id, student_id, params["message"]]
            )

          notify(session.teacher_id, "session_enrollment_request", "New Session Enrollment Request",
            "A student wants to join your session: #{session.title}",
            %{link_url: "/teachers/live-sessions/enrollments", related_entity_id: enrollment.id, priority: "high"})

          json(conn, %{message: "Enrollment request sent successfully", enrollment: enrollment})
      end
    else
      :not_found -> not_found(conn, "Session not found")
    end
  end

  def session_enrollments(conn, %{"session_id" => session_id}) do
    with {:ok, session} <- load_session(session_id),
         :ok <- authorize_teacher(conn, session) do
      enrollments =
        SQL.maps(
          "select #{@enrollment_cols} from public.live_session_enrollment_requests where session_id = $1::uuid order by requested_at desc",
          [session_id]
        )

      json(conn, %{enrollments: enrollments})
    else
      :not_found -> not_found(conn, "Session not found")
      :forbidden -> forbidden(conn, "Not authorized to view enrollments")
    end
  end

  def respond(conn, %{"enrollment_id" => enrollment_id} = params) do
    action = params["action"]

    cond do
      action not in ["approve", "reject"] ->
        conn |> put_status(400) |> json(%{detail: "Action must be 'approve' or 'reject'"})

      true ->
        enrollment =
          SQL.one("select id::text, session_id::text, student_id::text from public.live_session_enrollment_requests where id = $1::uuid", [enrollment_id])

        with false <- is_nil(enrollment),
             {:ok, session} <- load_session(enrollment.session_id),
             :ok <- authorize_teacher(conn, session) do
          new_status = if action == "approve", do: "approved", else: "rejected"

          updated =
            SQL.one(
              "update public.live_session_enrollment_requests set status = $2, teacher_response = $3, responded_at = now(), updated_at = now() " <>
                "where id = $1::uuid returning #{@enrollment_cols}",
              [enrollment_id, new_status, params["response_message"]]
            )

          notify_student(session, enrollment, action)
          json(conn, %{message: "Enrollment request #{new_status}", enrollment: updated})
        else
          true -> not_found(conn, "Enrollment request not found")
          :not_found -> not_found(conn, "Session not found")
          :forbidden -> forbidden(conn, "Not authorized")
        end
    end
  end

  def my_enrollments(conn, params) do
    {sql, args} =
      case params["status_filter"] do
        nil ->
          {"select #{@enrollment_cols} from public.live_session_enrollment_requests where student_id = $1::uuid order by requested_at desc", [uid(conn)]}

        status ->
          {"select #{@enrollment_cols} from public.live_session_enrollment_requests where student_id = $1::uuid and status = $2 order by requested_at desc", [uid(conn), status]}
      end

    json(conn, %{enrollments: SQL.maps(sql, args)})
  end

  # --- helpers ---------------------------------------------------------------

  defp load_session(session_id) do
    case SQL.one("select teacher_id::text, title, requires_payment, price::float from public.live_sessions where id = $1::uuid", [session_id]) do
      nil -> :not_found
      session -> {:ok, session}
    end
  end

  defp authorize_teacher(conn, session) do
    user_id = uid(conn)
    profile = SQL.one("select id::text from public.teacher_profiles where user_id = $1::uuid", [user_id])
    profile_id = profile && profile.id

    if session.teacher_id in [user_id, profile_id], do: :ok, else: :forbidden
  end

  defp notify_student(session, enrollment, action) do
    {type, title, msg} =
      cond do
        action == "approve" and session.requires_payment && (session.price || 0) > 0 ->
          {"payment_required", "Enrollment Request Approved!",
           "Your request to join '#{session.title}' has been approved. Please complete payment to join the session."}

        action == "approve" ->
          {"enrollment_approved", "Enrollment Request Approved!",
           "Your request to join '#{session.title}' has been approved. You can now join the session!"}

        true ->
          {"enrollment_rejected", "Enrollment Request Rejected",
           "Your request to join '#{session.title}' has been rejected."}
      end

    notify(enrollment.student_id, type, title, msg, %{related_entity_id: enrollment.id, priority: "high"})
  end

  # Best-effort notification (mirrors the Python's fire-and-forget). Extra
  # metadata rides in `data` since the notifications table has no link_url etc.
  defp notify(user_id, type, title, message, data) do
    try do
      SQL.maps(
        "insert into public.notifications (user_id, type, title, message, data) values ($1::uuid, $2::notification_type, $3, $4, $5::text::jsonb)",
        [user_id, type, title, message, Jason.encode!(data)]
      )
    rescue
      _ -> :ok
    end

    :ok
  end

  defp uid(conn), do: conn.assigns.current_user_id
  defp not_found(conn, msg), do: conn |> put_status(404) |> json(%{detail: msg})
  defp forbidden(conn, msg), do: conn |> put_status(403) |> json(%{detail: msg})
end
