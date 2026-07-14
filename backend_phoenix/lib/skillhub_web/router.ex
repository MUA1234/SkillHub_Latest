defmodule SkillHubWeb.Router do
  use SkillHubWeb, :router

  alias SkillHubWeb.Plugs.Authenticate

  pipeline :api do
    plug :accepts, ["json"]
  end

  # Routes that require a valid JWT (Bearer header or auth cookie).
  pipeline :authenticated do
    plug :accepts, ["json"]
    plug Authenticate
  end

  # Liveness probe.
  scope "/" do
    get "/healthz", SkillHubWeb.HealthController, :show
  end

  # Public (unauthenticated) API surface.
  scope "/api/v1", SkillHubWeb do
    pipe_through :api

    get "/impact", ImpactController, :show

    # Auth (no valid JWT yet) — bcrypt + email, now fully native.
    post "/auth/register", AuthController, :register
    post "/auth/login", AuthController, :login
    get "/auth/verify-email", AuthController, :verify_email
    post "/auth/verify-email", AuthController, :verify_email
    post "/auth/resend-verification", AuthController, :resend_verification
    post "/auth/forgot-password", AuthController, :forgot_password
    post "/auth/reset-password", AuthController, :reset_password
  end

  # ---- Natively-ported API surface ----------------------------------------
  # Anything NOT matched here never reaches the router: the StranglerProxy plug
  # (in the endpoint) forwards it to the Python service first.
  scope "/api/v1", SkillHubWeb do
    pipe_through :authenticated

    # Auth (password-less subset — login/register/etc. are proxied to Python)
    get "/auth/me", AuthController, :me
    post "/auth/refresh", AuthController, :refresh
    post "/auth/logout", AuthController, :logout

    # Notifications (realtime-backed REST)
    get "/notifications", NotificationController, :index
    patch "/notifications/mark-all-read", NotificationController, :mark_all_read
    post "/notifications/mark-all-read", NotificationController, :mark_all_read
    patch "/notifications/:id/read", NotificationController, :mark_read
    post "/notifications/:id/read", NotificationController, :mark_read
    delete "/notifications/:id", NotificationController, :delete

    # Subject catalogue
    get "/subjects", SubjectController, :index
    get "/subjects/categories", SubjectController, :categories

    # Moderation reports
    post "/students/reports", ReportController, :create

    # Analytics
    get "/sponsors/impact-summary", SponsorImpactController, :summary
    get "/teachers/analytics-summary", TeacherAnalyticsController, :summary

    # Accessibility (hot-path preferences + presets/reads; teacher-spec,
    # disability-profile POST, guardian-invite email, disability-types stay proxied)
    get "/accessibility/disability-profile", AccessibilityController, :get_disability_profile
    get "/accessibility/preferences", AccessibilityController, :get_preferences
    post "/accessibility/preferences", AccessibilityController, :save_preferences
    patch "/accessibility/preferences", AccessibilityController, :update_preferences
    get "/accessibility/presets", AccessibilityController, :get_presets
    get "/accessibility/guardian-links", AccessibilityController, :guardian_links
    get "/accessibility/onboarding-status", AccessibilityController, :onboarding_status

    # Admin (send-session-reminders stays proxied — email/SMS fan-out)
    get "/admin/dashboard", AdminController, :dashboard
    get "/admin/teachers/pending", AdminController, :pending_teachers
    post "/admin/teachers/:teacher_profile_id/verify", AdminController, :verify_teacher
    get "/admin/reports", AdminController, :reports
    post "/admin/reports/:report_id/resolve", AdminController, :resolve_report
    get "/admin/payouts", AdminController, :list_payouts
    post "/admin/payouts", AdminController, :create_payout
    post "/admin/payouts/:payout_id/approve", AdminController, :approve_payout
    post "/admin/payouts/:payout_id/mark-paid", AdminController, :mark_paid
    post "/admin/payouts/:payout_id/cancel", AdminController, :cancel_payout
    get "/teachers/earnings-summary", AdminController, :earnings_summary

    # Guardian dashboard (invite/accept-invite stay proxied — need bcrypt)
    get "/guardians/students", GuardianController, :list_students
    get "/guardians/students/:student_id/dashboard", GuardianController, :student_dashboard
    patch "/guardians/students/:student_id/accessibility", GuardianController, :update_accessibility

    # Payments (demo checkout + grant redemption; PayHere routes stay proxied)
    post "/payments/sessions/:session_id/payment", PaymentController, :create_session_payment
    get "/payments/my-payments", PaymentController, :my_payments
    post "/payments/scholarship-grant", PaymentController, :consume_grant
    get "/payments/sessions/:session_id/payment-status", PaymentController, :payment_status

    # Teacher hub (incremental — unlisted routes proxy to Python)
    get "/teachers/profile", TeacherController, :profile
    get "/teachers/profile/rest", TeacherController, :profile
    get "/teachers/sessions/rest", TeacherController, :sessions
    get "/teachers/courses/rest", TeacherController, :courses
    get "/teachers/courses/list", TeacherController, :courses_list
    get "/teachers/courses", TeacherController, :courses
    post "/teachers/courses", TeacherController, :create_course
    get "/teachers/payment-history", TeacherController, :payments
    get "/teachers/notifications", TeacherController, :notifications
    get "/teachers/notifications/rest", TeacherController, :notifications
    put "/teachers/notifications/:notification_id/read", TeacherController, :mark_notification_read
    put "/teachers/notifications/mark-all-read", TeacherController, :mark_all_notifications_read
    get "/teachers/subjects", TeacherController, :subjects
    post "/teachers/subjects", TeacherController, :add_subject
    delete "/teachers/subjects/:subject_id", TeacherController, :remove_subject
    put "/teachers/profile", TeacherController, :update_profile
    get "/teachers/sponsorship", TeacherController, :sponsorship
    post "/teachers/sponsorship", TeacherController, :create_sponsorship
    get "/teachers/sponsorship/:request_id", TeacherController, :get_sponsorship
    put "/teachers/sponsorship/:request_id", TeacherController, :update_sponsorship
    delete "/teachers/sponsorship/:request_id", TeacherController, :delete_sponsorship
    get "/teachers/students/rest", TeacherController, :students
    get "/teachers/students", TeacherController, :students
    get "/teachers/schedule/rest", TeacherController, :schedule
    get "/teachers/schedule", TeacherController, :schedule
    get "/teachers/schedule/simple", TeacherController, :schedule
    get "/teachers/schedule/conflicts", TeacherController, :schedule_conflicts
    post "/teachers/schedule/bulk-apply-template", TeacherController, :bulk_apply_template
    post "/teachers/schedule/bulk-reschedule", TeacherController, :bulk_reschedule
    post "/teachers/appointments", TeacherController, :create_appointment
    put "/teachers/appointments/:appointment_id", TeacherController, :update_appointment
    delete "/teachers/appointments/:appointment_id", TeacherController, :delete_appointment
    post "/teachers/availability", TeacherController, :create_availability
    put "/teachers/availability/:block_id", TeacherController, :update_availability
    delete "/teachers/availability/:block_id", TeacherController, :delete_availability
    get "/teachers/earnings", TeacherController, :earnings
    get "/teachers/payments", TeacherController, :payments
    get "/teachers/payments/rest", TeacherController, :payments
    get "/teachers/health", TeacherController, :health
    get "/teachers/sessions", TeacherController, :sessions
    post "/teachers/sessions", TeacherController, :create_session
    put "/teachers/sessions/:session_id", TeacherController, :update_session
    put "/teachers/sessions/:session_id/status", TeacherController, :update_session_status
    delete "/teachers/sessions/:session_id", TeacherController, :delete_session
    get "/teachers/sessions/:session_id/participants", TeacherController, :session_participants
    post "/teachers/sessions/:session_id/participants/:student_id", TeacherController, :add_participant
    delete "/teachers/sessions/:session_id/participants/:student_id", TeacherController, :remove_participant
    put "/teachers/sessions/:session_id/recording", TeacherController, :update_recording
    delete "/teachers/sessions/:session_id/recording", TeacherController, :delete_recording
    put "/teachers/sessions/:session_id/participants/:student_id/join", TeacherController, :mark_joined
    put "/teachers/sessions/:session_id/participants/:student_id/leave", TeacherController, :mark_left
    get "/teachers/sessions/:session_id/analytics", TeacherController, :session_analytics
    put "/teachers/students/:student_id/progress", TeacherController, :update_student_progress
    post "/teachers/students/add", TeacherController, :add_student
    post "/teachers/students/message", TeacherController, :message_student
    post "/teachers/students/email", TeacherController, :email_student
    post "/teachers/students/report", TeacherController, :report_student
    get "/teachers/analytics", TeacherController, :analytics
    get "/teachers/content", TeacherController, :content
    patch "/teachers/content/:content_id/accessibility-tracks", TeacherController, :update_accessibility_tracks
    # File-upload routes (avatar/content/tracks) intentionally NOT wired: Supabase
    # Storage needs the service-role key (absent here — Python uses a local-disk
    # fallback), so they proxy to Python. `SkillHub.Storage` + the upload actions
    # in TeacherController are ready to wire the moment SUPABASE_SERVICE_KEY exists.
    get "/teachers/events", TeacherController, :events
    post "/teachers/events", TeacherController, :create_event
    get "/teachers/events/categories", TeacherController, :event_categories
    post "/teachers/events/categories", TeacherController, :create_event_category
    get "/teachers/events/templates", TeacherController, :event_templates
    post "/teachers/events/from-template", TeacherController, :event_from_template
    get "/teachers/events/:event_id", TeacherController, :get_event
    put "/teachers/events/:event_id", TeacherController, :update_event
    delete "/teachers/events/:event_id", TeacherController, :delete_event
    put "/teachers/events/:event_id/status", TeacherController, :event_status
    post "/teachers/events/:event_id/archive", TeacherController, :event_archive
    get "/teachers/events/:event_id/registrations", TeacherController, :event_registrations
    post "/teachers/events/:event_id/registrations", TeacherController, :add_event_registration
    get "/teachers/events/:event_id/analytics", TeacherController, :event_analytics
    post "/teachers/events/:event_id/promotional-material", TeacherController, :event_promotional_material

    # Student hub (incremental — unlisted routes proxy to Python)
    get "/students/dashboard", StudentController, :dashboard
    get "/students/profile", StudentController, :profile
    put "/students/profile", StudentController, :update_profile
    get "/students/find-teachers", StudentController, :find_teachers
    get "/students/subjects", StudentController, :subjects
    post "/students/contact-teacher", StudentController, :contact_teacher
    get "/students/session-recordings", StudentController, :session_recordings
    post "/students/join-session/:session_id", StudentController, :join_session
    post "/students/set-reminder/:session_id", StudentController, :set_reminder
    get "/students/events", StudentController, :events
    get "/students/events/categories", StudentController, :event_categories
    post "/students/events/:event_id/register", StudentController, :register_event
    delete "/students/events/:event_id/register", StudentController, :unregister_event
    post "/students/events/:event_id/bookmark", StudentController, :bookmark_event
    delete "/students/events/:event_id/bookmark", StudentController, :unbookmark_event
    get "/students/conversations", StudentController, :conversations
    get "/students/conversations/:conversation_id/messages", StudentController, :conversation_messages
    post "/students/conversations/:conversation_id/messages", StudentController, :send_message
    post "/students/conversations", StudentController, :create_conversation
    get "/students/live-sessions", StudentController, :live_sessions
    get "/students/campaigns", StudentController, :campaigns
    get "/students/pre-recorded-lessons", StudentController, :pre_recorded_lessons
    get "/students/content-library", StudentController, :content_library
    get "/students/content-categories", StudentController, :content_categories
    get "/students/content/:content_id", StudentController, :content_detail
    post "/students/content/:content_id/progress", StudentController, :content_progress
    get "/students/forum/posts", StudentController, :forum_posts
    get "/students/forum/categories", StudentController, :forum_categories
    get "/students/forum/stats", StudentController, :forum_stats
    get "/students/forum/posts/:post_id", StudentController, :forum_post_detail
    post "/students/forum/posts", StudentController, :create_forum_post
    post "/students/forum/posts/:post_id/vote", StudentController, :vote_forum_post
    post "/students/forum/posts/:post_id/replies", StudentController, :create_forum_reply
    get "/students/enrolled-courses", StudentController, :enrolled_courses
    get "/students/payment-history", StudentController, :payment_history
    get "/students/wishlist", StudentController, :wishlist
    post "/students/wishlist", StudentController, :add_wishlist
    delete "/students/wishlist/:course_id", StudentController, :remove_wishlist

    # Sponsor hub (incremental — unlisted routes proxy to Python)
    post "/sponsors/profile/setup", SponsorController, :setup_profile
    get "/sponsors/dashboard", SponsorController, :dashboard
    get "/sponsors/dashboard/rest", SponsorController, :dashboard
    get "/sponsors/recent-impact", SponsorController, :recent_impact
    get "/sponsors/campaigns/detailed", SponsorController, :campaigns_detailed
    get "/sponsors/campaigns/rest", SponsorController, :campaigns
    get "/sponsors/campaigns", SponsorController, :campaigns
    post "/sponsors/campaigns", SponsorController, :create_campaign
    put "/sponsors/campaigns/:campaign_id", SponsorController, :update_campaign
    delete "/sponsors/campaigns/:campaign_id", SponsorController, :delete_campaign
    get "/sponsors/sponsorship-requests/rest", SponsorController, :sponsorship_requests
    get "/sponsors/sponsorship-requests", SponsorController, :sponsorship_requests
    put "/sponsors/sponsorship-requests/:request_id/status", SponsorController, :update_request_status
    get "/sponsors/events/rest", SponsorController, :events
    get "/sponsors/events", SponsorController, :events
    post "/sponsors/events", SponsorController, :create_event
    get "/sponsors/events/:event_id", SponsorController, :get_event
    put "/sponsors/events/:event_id", SponsorController, :update_event
    delete "/sponsors/events/:event_id", SponsorController, :delete_event
    put "/sponsors/events/:event_id/launch", SponsorController, :launch_event

    # Scholarships + access codes
    get "/sponsors/scholarships", ScholarshipController, :list_mine
    post "/sponsors/scholarships", ScholarshipController, :create
    get "/sponsors/scholarships/:scholarship_id", ScholarshipController, :get_mine
    patch "/sponsors/scholarships/:scholarship_id", ScholarshipController, :update
    delete "/sponsors/scholarships/:scholarship_id", ScholarshipController, :delete
    get "/sponsors/scholarships/:scholarship_id/applications", ScholarshipController, :list_applications
    patch "/sponsors/scholarship-applications/:application_id", ScholarshipController, :review_application
    get "/sponsors/access-codes", ScholarshipController, :list_access_codes
    post "/sponsors/access-codes", ScholarshipController, :create_access_codes
    delete "/sponsors/access-codes/:code_id", ScholarshipController, :revoke_access_code
    get "/students/scholarships", ScholarshipController, :list_open
    get "/students/scholarships/:scholarship_id", ScholarshipController, :get_open
    post "/students/scholarships/:scholarship_id/apply", ScholarshipController, :apply
    get "/students/scholarship-applications", ScholarshipController, :my_applications
    get "/students/funding-grants", ScholarshipController, :my_grants
    post "/students/redeem-access-code", ScholarshipController, :redeem

    # Exams / quizzes
    get "/teachers/exams", ExamController, :list_teacher_exams
    post "/teachers/exams", ExamController, :create_exam
    get "/teachers/exams/:exam_id", ExamController, :get_teacher_exam
    patch "/teachers/exams/:exam_id", ExamController, :update_exam
    delete "/teachers/exams/:exam_id", ExamController, :delete_exam
    get "/teachers/exams/:exam_id/submissions", ExamController, :list_submissions
    get "/students/exams", ExamController, :list_student_exams
    get "/students/exams/:exam_id", ExamController, :get_student_exam
    post "/students/exams/:exam_id/start", ExamController, :start_exam
    post "/students/exams/:exam_id/submit", ExamController, :submit_exam
    get "/students/exams/:exam_id/results", ExamController, :my_results

    # Session enrollment requests
    post "/enrollments/sessions/:session_id/enroll", EnrollmentController, :enroll
    get "/enrollments/sessions/:session_id/enrollments", EnrollmentController, :session_enrollments
    patch "/enrollments/enrollments/:enrollment_id/respond", EnrollmentController, :respond
    get "/enrollments/my-enrollments", EnrollmentController, :my_enrollments

    # Role-agnostic user profile + dashboard stats
    get "/users/profile", UserController, :get_profile
    put "/users/profile", UserController, :update_profile
    get "/users/dashboard-stats", UserController, :dashboard_stats

    # Language preferences
    get "/language/supported", LanguageController, :supported
    get "/language/preference", LanguageController, :get_preference
    post "/language/preference", LanguageController, :save_preference
    patch "/language/preference", LanguageController, :update_preference
    get "/language/user-settings", LanguageController, :user_settings
    post "/language/quick-change/:language_code", LanguageController, :quick_change

    # Peer matching
    get "/students/peer-matches", PeerMatchingController, :index

    # Learning groups (specific routes before the :group_id catch-all)
    get "/students/groups", GroupController, :index
    get "/students/groups/mine", GroupController, :mine
    post "/students/groups", GroupController, :create
    get "/students/groups/:group_id", GroupController, :show
    post "/students/groups/:group_id/join", GroupController, :join
    post "/students/groups/:group_id/leave", GroupController, :leave
  end
end
