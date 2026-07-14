defmodule SkillHubWeb.ReportController do
  @moduledoc "Ported moderation report submission (reports.py)."
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  @categories ~w(spam harassment hate_speech inappropriate misinformation other)

  def create(conn, params) do
    category = params |> Map.get("category", "") |> to_string() |> String.downcase() |> String.trim()
    description = params |> Map.get("description", "") |> to_string() |> String.trim()
    reported_user_id = blank_to_nil(params["reported_user_id"])
    reported_post_id = blank_to_nil(params["reported_post_id"])
    reported_message_id = blank_to_nil(params["reported_message_id"])

    cond do
      category not in @categories ->
        conn |> put_status(400) |> json(%{detail: "Invalid category. Must be one of: #{Enum.join(Enum.sort(@categories), ", ")}"})

      String.length(description) < 5 ->
        conn |> put_status(400) |> json(%{detail: "Description must be at least 5 characters."})

      is_nil(reported_user_id) and is_nil(reported_post_id) and is_nil(reported_message_id) ->
        conn |> put_status(400) |> json(%{detail: "At least one of reported_user_id / reported_post_id / reported_message_id is required."})

      true ->
        row =
          SQL.one(
            """
            insert into public.reports
              (reporter_id, category, description, reported_user_id, reported_post_id, reported_message_id)
            values ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid)
            returning id::text, reporter_id::text, category, description, status
            """,
            [
              current_user_id(conn),
              category,
              description,
              reported_user_id,
              reported_post_id,
              reported_message_id
            ]
          )

        json(conn, %{success: true, report: row})
    end
  end

  defp current_user_id(conn), do: conn.assigns.current_user_id
  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(""), do: nil
  defp blank_to_nil(v), do: v
end
