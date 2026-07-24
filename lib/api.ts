const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ngrok's free tier serves a "you're about to visit..." HTML interstitial to
// browser-like requests instead of proxying to the tunnel target, which has
// no CORS headers and gets blocked by the browser. This header (ngrok's own
// documented escape hatch) makes ngrok skip that page. Harmless against a
// non-ngrok backend — it's just an extra header the server ignores.
if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(API_BASE_URL)) {
      init = {
        ...init,
        headers: { ...(init.headers || {}), "ngrok-skip-browser-warning": "true" },
      };
    }
    return originalFetch(input, init);
  };
}

export interface User {
  id: string;
  email: string;
  role: "student" | "teacher" | "sponsor";
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: UserProfile;
  // Accessibility-track enrichment from login / /me.
  // Students: `accessibility_track` = their primary track (landing dashboard).
  // Teachers: `teaching_tracks` + `verified_specialist`.
  accessibility_track?: "visual" | "hearing" | null;
  teaching_tracks?: string[] | null;
  verified_specialist?: boolean | null;
}

export interface UserProfile {
  id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  date_of_birth?: string;
  location?: string;
  bio?: string;
  avatar_url?: string;
  university?: string;
  student_id?: string;
  major?: string;
  year?: string;
  gpa?: number;
  reputation_score: number;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: "student" | "teacher" | "sponsor";
  first_name?: string;
  last_name?: string;
  disabilityStatus?: 'Yes' | 'No';
  disabilityType?: 'Visual impairment' | 'Hearing impairment';
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface TeacherDashboardStats {
  total_students: number;
  monthly_earnings: number;
  active_courses: number;
  average_rating: number;
  recent_classes: Array<{
    id: string;
    subject: string;
    students: number;
    time: string;
  }>;
}

export interface TeacherProfileResponse {
  profile: any;
  subjects: any[];
  stats: {
    total_students: number;
    active_students: number;
    total_courses: number;
    active_sessions: number;
    completed_sessions: number;
    total_earnings: number;
    monthly_earnings: number;
    total_teaching_hours: number;
    avg_completion_rate: number;
    average_rating: number;
  };
  recent_reviews: any[];
}

export interface SponsorCampaignsParams {
  status_filter?: string;
  page?: number;
  limit?: number;
}

export interface SponsorEventsParams {
  status_filter?: string;
  upcoming?: boolean;
  page?: number;
  limit?: number;
}

export interface SponsorshipRequestsParams {
  status_filter?: string;
  category_filter?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCampaignData {
  title: string;
  description: string;
  budget: number;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCampaignData {
  title?: string;
  description?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
}

export interface CreateSponsorEventData {
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  location: string;
  isVirtual: boolean;
  budget: number;
  maxAttendees: number;
  imageUrl?: string;
  tags?: string[];
  level?: string;
  hasCertificate?: boolean;
  isFeatured?: boolean;
}

export interface UpdateSponsorEventData {
  title?: string;
  description?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  isVirtual?: boolean;
  budget?: number;
  maxAttendees?: number;
  imageUrl?: string;
  tags?: string[];
  level?: string;
  hasCertificate?: boolean;
  isFeatured?: boolean;
}

export interface SponsorAnalyticsParams {
  time_range?: string;
}

/**
 * Wire an XHR's upload progress to a callback that receives percent (0–100) and
 * a periodically-updated instantaneous speed in bytes/sec. Speed is sampled at
 * most ~5×/sec so the readout is stable rather than jittery.
 */
function attachUploadProgress(
  xhr: XMLHttpRequest,
  onProgress?: (percent: number, bytesPerSecond?: number) => void,
) {
  if (!onProgress) return;
  let lastLoaded = 0;
  let lastTime = Date.now();
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const percent = Math.round((e.loaded / e.total) * 100);
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    let bps: number | undefined;
    if (dt >= 0.2) {
      bps = (e.loaded - lastLoaded) / dt;
      lastLoaded = e.loaded;
      lastTime = now;
    }
    onProgress(percent, bps);
  };
}

class APIClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("access_token");
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
    }
  }

  private ensureToken(): string | null {
    if (!this.token && typeof window !== "undefined") {
      this.token = localStorage.getItem("access_token");
    }
    return this.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = this.ensureToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const token = this.ensureToken();

    const isFormData = options.body instanceof FormData;
    const baseHeaders = isFormData
      ? { Authorization: token ? `Bearer ${token}` : "" }
      : this.getHeaders();

    const config: RequestInit = {
      ...options,
      headers: {
        ...baseHeaders,
        ...(options.headers || {}),
      },
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (e) {
        }
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).response = { data: { detail: errorMessage } };
        throw error;
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && (error as any).response) {
        throw error;
      }

      const networkError = new Error(
        error instanceof Error ? error.message : "Network error occurred"
      );
      (networkError as any).response = {
        data: { detail: networkError.message },
      };
      throw networkError;
    }
  }

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
      credentials: "include",
    });

    this.setToken(response.access_token);
    return response;
  }

  async register(userData: RegisterRequest): Promise<User> {
    return this.request<User>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async logout(): Promise<{ success: boolean }> {
    try {
      const result = await this.request<{ success: boolean }>("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      return result;
    } finally {
      this.clearToken();
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>("/api/v1/auth/me");
  }

  /** Persist a student's disability profile (drives tracks + the data wall).
   *  Requires an authenticated session. */
  async saveDisabilityProfile(payload: {
    has_disability: boolean;
    disability_types: string[];
    primary_disability?: string | null;
    severity_levels?: Record<string, string>;
    onboarding_completed?: boolean;
    [k: string]: any;
  }): Promise<{ success: boolean; message?: string }> {
    return this.request("/api/v1/accessibility/disability-profile", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** Get a presigned PUT URL and upload a large media file directly to R2,
   *  bypassing the API server. Returns the stored object key to persist. */
  async uploadMediaToR2(
    file: File,
    kind: "media" | "recording" | "caption" | "audio" = "media",
    onProgress?: (percent: number, bytesPerSecond?: number) => void,
  ): Promise<{ key: string }> {
    const presign = await this.request<{ upload_url: string; key: string; headers: Record<string, string> }>(
      "/api/v1/uploads/presign",
      {
        method: "POST",
        body: JSON.stringify({ filename: file.name, content_type: file.type, kind }),
      },
    );
    // XHR (not fetch) so we can report real upload progress + speed.
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presign.upload_url);
      Object.entries(presign.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      attachUploadProgress(xhr, onProgress);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Direct upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(file);
    });
    onProgress?.(100);
    return { key: presign.key };
  }

  /** POST a FormData (with a file) to the backend while reporting upload
   *  progress — a fetch replacement for uploads that need a progress bar. */
  async uploadFormWithProgress<T = any>(
    endpoint: string,
    formData: FormData,
    onProgress?: (percent: number, bytesPerSecond?: number) => void,
  ): Promise<T> {
    const token = this.ensureToken();
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseURL}${endpoint}`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      attachUploadProgress(xhr, onProgress);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          try {
            resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as T) : ({} as T));
          } catch {
            resolve({} as T);
          }
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            const d = JSON.parse(xhr.responseText);
            msg = d.detail || d.message || msg;
          } catch {
            /* keep default */
          }
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  }

  /** Mint a short-lived playback URL for a stored R2 object key. */
  async getMediaUrl(key: string): Promise<string> {
    const res = await this.request<{ url: string }>("/api/v1/uploads/media-url", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    return res.url;
  }

  /** Resolve a stored content_url for playback: `r2://<key>` values become a
   *  short-lived presigned URL; everything else is returned unchanged. */
  async resolveMediaUrl(contentUrl: string | null | undefined): Promise<string> {
    if (contentUrl && contentUrl.startsWith("r2://")) {
      return this.getMediaUrl(contentUrl.slice("r2://".length));
    }
    return contentUrl || "";
  }

  /** Persist a teacher's specialization; `disability_experience` determines the
   *  teacher's teaching tracks server-side. Requires an authenticated session. */
  async saveTeacherSpecialization(payload: {
    specializations: string[];
    disability_experience: string[];
    accepts_iep_students?: boolean;
    [k: string]: any;
  }): Promise<{ success: boolean; message?: string }> {
    return this.request("/api/v1/accessibility/teacher-specialization", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async refreshToken(): Promise<{ access_token: string; token_type: string }> {
    return this.request("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  }

  async verifyEmail(token: string): Promise<{ success: boolean; already_verified?: boolean }> {
    return this.request("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async resendVerification(email: string): Promise<{ success: boolean }> {
    return this.request("/api/v1/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async forgotPassword(email: string): Promise<{ success: boolean }> {
    return this.request("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    return this.request("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  }

  async setupSponsorProfile(profile: {
    company_name: string;
    industry?: string;
    website?: string;
    description?: string;
    contact_person?: string;
    contact_email?: string;
    contact_phone?: string;
    logo_url?: string;
  }): Promise<{ success: boolean; profile_id?: string; created: boolean }> {
    return this.request("/api/v1/sponsors/profile/setup", {
      method: "POST",
      body: JSON.stringify(profile),
    });
  }

  /** Fetch the caller's sponsor_profiles row to pre-fill the profile page. */
  async getSponsorProfile(): Promise<{ success: boolean; profile: Record<string, any> }> {
    return this.request("/api/v1/sponsors/profile");
  }


  /** View an invite by its verification code. Public — the code IS the auth.
   *  The endpoint returns the student summary so the verify page can render
   *  "{student} invited you to be their guardian". */
  async getGuardianInvite(code: string): Promise<{
    guardian_email: string;
    guardian_name?: string | null;
    relationship?: string | null;
    student: { id: string; name: string; email?: string; avatar_url?: string };
    expires_at?: string | null;
    permissions: Record<string, boolean>;
  }> {
    return this.request(`/api/v1/guardians/invite/${encodeURIComponent(code)}`);
  }

  /** Accept an invite. New guardian → pass `password` (+ optional name).
   *  Existing user (matched by email) → omit `password`; the existing
   *  account just gets linked. The response carries an access_token so the
   *  page can drop the user straight into the guardian dashboard. */
  async acceptGuardianInvite(payload: {
    code: string;
    password?: string;
    first_name?: string;
    last_name?: string;
  }): Promise<{
    success: boolean;
    access_token: string;
    user: { id: string; email: string; role: string; is_verified: boolean };
    student: { id: string; name: string };
  }> {
    const result = await this.request<any>(
      "/api/v1/guardians/accept-invite",
      { method: "POST", body: JSON.stringify(payload) },
    );
    if (result?.access_token) {
      this.setToken(result.access_token);
      if (typeof window !== "undefined" && result?.user) {
        localStorage.setItem(
          "current_user",
          JSON.stringify({
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
            profile: {
              first_name: payload.first_name || "",
              last_name: payload.last_name || "",
            },
          }),
        );
      }
    }
    return result;
  }

  /** List the students linked to the active guardian account. */
  async listLinkedStudents(): Promise<{
    success: boolean;
    links: Array<{
      id: string;
      student_id: string;
      student?: { id: string; name: string; email?: string; avatar_url?: string };
      can_view_progress: boolean;
      can_view_grades: boolean;
      can_view_accessibility: boolean;
      can_communicate_teachers: boolean;
      can_modify_accessibility: boolean;
      relationship?: string | null;
      verified_at?: string | null;
    }>;
  }> {
    return this.request("/api/v1/guardians/students");
  }

  /** Per-student dashboard payload — gated by the link's permission flags. */
  async getGuardianStudentDashboard(studentId: string): Promise<any> {
    return this.request(`/api/v1/guardians/students/${encodeURIComponent(studentId)}/dashboard`);
  }

  /** Apply a narrow accessibility update on a student's behalf. Requires
   *  `can_modify_accessibility=true` on the link. */
  async updateLinkedStudentAccessibility(
    studentId: string,
    updates: Partial<{
      high_contrast: boolean;
      reduced_motion: boolean;
      screen_reader_optimized: boolean;
      text_to_speech: boolean;
      speech_to_text: boolean;
      font_size: number;
    }>,
  ): Promise<{ success: boolean; updated: number }> {
    return this.request(
      `/api/v1/guardians/students/${encodeURIComponent(studentId)}/accessibility`,
      { method: "PATCH", body: JSON.stringify(updates) },
    );
  }


  async listMyCertificates(): Promise<{
    success: boolean;
    certificates: Array<{
      enrollment_id: string;
      course_id: string;
      course_title: string;
      teacher_name: string;
      completed_at?: string | null;
      progress_percentage?: number | null;
    }>;
  }> {
    return this.request("/api/v1/students/certificates");
  }

  /** Trigger a browser download for the certificate PDF. The request goes
   *  through fetch (instead of a plain `<a download>`) so the auth header
   *  is attached. */
  async downloadCertificate(enrollmentId: string, lang?: string): Promise<void> {
    const qs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
    const res = await fetch(
      `${this.baseURL}/api/v1/students/courses/${encodeURIComponent(enrollmentId)}/certificate${qs}`,
      {
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        credentials: "include",
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Certificate download failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillhub-certificate-${enrollmentId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }


  async listTeacherExams(courseId?: string): Promise<{ success: boolean; exams: any[] }> {
    const qs = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
    return this.request(`/api/v1/teachers/exams${qs}`);
  }

  async getTeacherExam(examId: string): Promise<{ success: boolean; exam: any }> {
    return this.request(`/api/v1/teachers/exams/${encodeURIComponent(examId)}`);
  }

  async createExam(payload: any): Promise<{ success: boolean; exam: any }> {
    return this.request(`/api/v1/teachers/exams`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateExam(examId: string, payload: any): Promise<{ success: boolean }> {
    return this.request(`/api/v1/teachers/exams/${encodeURIComponent(examId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async deleteExam(examId: string): Promise<{ success: boolean }> {
    return this.request(`/api/v1/teachers/exams/${encodeURIComponent(examId)}`, {
      method: "DELETE",
    });
  }

  async listExamSubmissions(examId: string): Promise<{ success: boolean; submissions: any[] }> {
    return this.request(`/api/v1/teachers/exams/${encodeURIComponent(examId)}/submissions`);
  }

  async listStudentExams(courseId?: string): Promise<{ success: boolean; exams: any[] }> {
    const qs = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
    return this.request(`/api/v1/students/exams${qs}`);
  }

  async getStudentExam(examId: string): Promise<{
    success: boolean;
    exam: any;
    accommodations: Record<string, any>;
    prior_attempts: any[];
    attempts_allowed: number;
  }> {
    return this.request(`/api/v1/students/exams/${encodeURIComponent(examId)}`);
  }

  async startExamAttempt(examId: string): Promise<{ success: boolean; attempt: any; accommodations: Record<string, any> }> {
    return this.request(`/api/v1/students/exams/${encodeURIComponent(examId)}/start`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async submitExam(examId: string, answers: Record<string, any>): Promise<{
    success: boolean;
    result: {
      attempt_id: string;
      total_marks: number;
      marks_obtained: number;
      percentage: number;
      is_passed: boolean | null;
      needs_review: boolean;
      feedback: any[];
    };
  }> {
    return this.request(`/api/v1/students/exams/${encodeURIComponent(examId)}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }


  async updateContentAccessibilityTracks(
    contentId: string,
    payload: Partial<{
      caption_url: string | null;
      transcript_url: string | null;
      audio_description_url: string | null;
      sign_language_video_url: string | null;
    }>,
  ): Promise<{ success: boolean; updated: number }> {
    return this.request(
      `/api/v1/teachers/content/${encodeURIComponent(contentId)}/accessibility-tracks`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  }


  async getPeerMatches(limit = 20): Promise<{
    success: boolean;
    matches: Array<{
      user_id: string;
      name: string;
      avatar_url?: string | null;
      location?: string | null;
      score: number;
      reasons: string[];
    }>;
  }> {
    return this.request(`/api/v1/students/peer-matches?limit=${limit}`);
  }


  async getSponsorImpactSummary(): Promise<{
    success: boolean;
    scholarships: { count: number; total_funded_lkr: number; slots_total: number; slots_filled: number };
    students_funded: {
      count: number;
      completed_at_least_one_course: number;
      currently_active: number;
      completion_rate: number | null;
      grant_total_lkr: number;
    };
    funded_trend: Array<{ month: string; count: number }>;
    geography: Array<{ name: string; count: number }>;
    disability_breakdown: Array<{ type: string; count: number }>;
  }> {
    return this.request(`/api/v1/sponsors/impact-summary`);
  }


  async downloadProgressReport(period: 'week' | 'month' = 'week'): Promise<void> {
    const res = await fetch(
      `${this.baseURL}/api/v1/students/progress-report?period=${period}`,
      {
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        credentials: 'include',
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Progress report download failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skillhub-progress-${period}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async downloadAccessibilityProgressReport(
    period: 'week' | 'month' = 'week',
  ): Promise<void> {
    const res = await fetch(
      `${this.baseURL}/api/v1/students/accessibility-progress-report?period=${period}`,
      {
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        credentials: 'include',
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        text || `Accessibility report download failed (${res.status})`,
      );
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skillhub-accessibility-${period}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }


  async getTeacherAnalyticsSummary(
    period: 'week' | 'month' | 'quarter' | 'year' = 'month',
  ): Promise<{
    success: boolean;
    period: string;
    hours_taught: number;
    students_taught: number;
    completed_sessions: number;
    avg_rating: number | null;
    review_count: number;
    total_earnings_lkr: number;
    earnings_trend: Array<{ month: string; amount: number }>;
    student_retention: number | null;
  }> {
    return this.request(
      `/api/v1/teachers/analytics-summary?period=${period}`,
    );
  }


  async listGroups(q?: string): Promise<{ success: boolean; groups: any[] }> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request(`/api/v1/students/groups${qs}`);
  }

  async listMyGroups(): Promise<{ success: boolean; groups: any[] }> {
    return this.request(`/api/v1/students/groups/mine`);
  }

  async createGroup(payload: {
    name: string;
    description?: string;
    group_type?: string;
    level?: string;
    max_members?: number;
    language?: string;
    tags?: string[];
  }): Promise<{ success: boolean; group: any }> {
    return this.request(`/api/v1/students/groups`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getGroup(id: string): Promise<{ success: boolean; group: any; members: any[]; my_role: string | null; is_member: boolean }> {
    return this.request(`/api/v1/students/groups/${encodeURIComponent(id)}`);
  }

  async joinGroup(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/v1/students/groups/${encodeURIComponent(id)}/join`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async leaveGroup(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/v1/students/groups/${encodeURIComponent(id)}/leave`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }


  async appendCaption(
    meetingId: string,
    payload: { text: string; language?: string; confidence?: number },
  ): Promise<{ success: boolean }> {
    return this.request(
      `/api/v1/meetings/captions/${encodeURIComponent(meetingId)}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async listCaptions(
    meetingId: string,
  ): Promise<{ success: boolean; captions: any[] }> {
    return this.request(
      `/api/v1/meetings/captions/${encodeURIComponent(meetingId)}`,
    );
  }


  async getAdminDashboard(): Promise<any> {
    return this.request(`/api/v1/admin/dashboard`);
  }

  async listPendingTeachers(): Promise<{ success: boolean; teachers: any[] }> {
    return this.request(`/api/v1/admin/teachers/pending`);
  }

  async verifyTeacher(
    teacherProfileId: string,
    payload: { approve: boolean; notes?: string },
  ): Promise<{ success: boolean }> {
    return this.request(
      `/api/v1/admin/teachers/${encodeURIComponent(teacherProfileId)}/verify`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async listOpenReports(): Promise<{ success: boolean; reports: any[] }> {
    return this.request(`/api/v1/admin/reports`);
  }

  async resolveReport(
    reportId: string,
    payload: { action: string; admin_notes?: string },
  ): Promise<{ success: boolean }> {
    return this.request(
      `/api/v1/admin/reports/${encodeURIComponent(reportId)}/resolve`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async listAdminPayouts(
    statusFilter?: string,
  ): Promise<{ success: boolean; payouts: any[] }> {
    const qs = statusFilter
      ? `?status_filter=${encodeURIComponent(statusFilter)}`
      : "";
    return this.request(`/api/v1/admin/payouts${qs}`);
  }

  async createAdminPayout(payload: {
    teacher_profile_id: string;
    amount_lkr: number;
    period_start?: string;
    period_end?: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_account_holder?: string;
    admin_notes?: string;
  }): Promise<{ success: boolean; payout: any }> {
    return this.request(`/api/v1/admin/payouts`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async approveAdminPayout(
    payoutId: string,
    admin_notes?: string,
  ): Promise<{ success: boolean }> {
    return this.request(
      `/api/v1/admin/payouts/${encodeURIComponent(payoutId)}/approve`,
      { method: "POST", body: JSON.stringify({ admin_notes }) },
    );
  }

  async markAdminPayoutPaid(
    payoutId: string,
    payload: { bank_reference: string; admin_notes?: string },
  ): Promise<{ success: boolean }> {
    return this.request(
      `/api/v1/admin/payouts/${encodeURIComponent(payoutId)}/mark-paid`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async cancelAdminPayout(
    payoutId: string,
    admin_notes?: string,
  ): Promise<{ success: boolean }> {
    return this.request(
      `/api/v1/admin/payouts/${encodeURIComponent(payoutId)}/cancel`,
      { method: "POST", body: JSON.stringify({ admin_notes }) },
    );
  }

  async sendSessionRemindersNow(
    windowMinutes: number = 30,
  ): Promise<{
    success: boolean;
    sessions_found: number;
    emails_queued: number;
    sms_sent: number;
    skipped: number;
    window_minutes: number;
  }> {
    return this.request(
      `/api/v1/admin/send-session-reminders?window_minutes=${windowMinutes}`,
      { method: "POST" },
    );
  }

  async submitReport(payload: {
    category: string;
    description: string;
    reported_user_id?: string;
    reported_post_id?: string;
    reported_message_id?: string;
  }): Promise<{ success: boolean; report: any }> {
    return this.request(`/api/v1/students/reports`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getMyEarningsSummary(): Promise<{
    success: boolean;
    currency: string;
    gross_earned: number;
    paid_out: number;
    outstanding: number;
    payouts: any[];
  }> {
    return this.request(`/api/v1/teachers/earnings-summary`);
  }

  async getUserProfile(): Promise<UserProfile> {
    return this.request<UserProfile>("/api/v1/users/profile");
  }

  async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    return this.request<UserProfile>("/api/v1/users/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  }

  async getDashboardStats(): Promise<any> {
    return this.request("/api/v1/users/dashboard-stats");
  }

  async getTeacherDashboardStats(): Promise<TeacherDashboardStats> {
    const response = await this.request<TeacherProfileResponse>(
      "/api/v1/teachers/profile"
    );

    return {
      total_students: response.stats.total_students,
      monthly_earnings: response.stats.monthly_earnings,
      active_courses: response.stats.total_courses,
      average_rating: response.stats.average_rating,
      recent_classes: [],
    };
  }

  async getTeachers(): Promise<any[]> {
    return this.request<any[]>("/api/v1/teachers/");
  }

  async getTeacherProfile(): Promise<TeacherProfileResponse> {
    try {
      return await this.request<TeacherProfileResponse>("/api/v1/teachers/profile");
    } catch (error) {
      console.warn("Main profile endpoint failed, trying REST fallback...");
      try {
        const restResponse = await this.request<any>("/api/v1/teachers/profile/rest");
        return {
          profile: restResponse.profile,
          subjects: restResponse.subjects || [],
          stats: restResponse.stats,
          recent_reviews: restResponse.recent_reviews || []
        } as TeacherProfileResponse;
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  /** Update the caller's teacher_profiles row (title, rate, teaching style,
   *  languages, etc.). Backs the teacher profile edit page. */
  async updateTeacherProfile(profile: Record<string, any>): Promise<any> {
    return this.request("/api/v1/teachers/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  }

  async getTeacherSubjects(): Promise<any[]> {
    return this.request<any[]>("/api/v1/teachers/subjects");
  }

  async getTeacherCourses(): Promise<any> {
    try {
      return await this.request("/api/v1/teachers/courses");
    } catch (error) {
      console.warn("Main courses endpoint failed, trying REST fallback...");
      try {
        return await this.request("/api/v1/teachers/courses/rest");
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async getTeacherSessions(): Promise<any> {
    try {
      return await this.request("/api/v1/teachers/sessions");
    } catch (error) {
      console.warn("Main sessions endpoint failed, trying REST fallback...");
      try {
        return await this.request("/api/v1/teachers/sessions/rest");
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async getSessionEnrollmentRequests(
    sessionId: string,
  ): Promise<{ enrollments: any[] }> {
    return this.request(`/api/v1/enrollments/sessions/${sessionId}/enrollments`);
  }

  async respondToEnrollmentRequest(
    enrollmentId: string,
    action: 'approve' | 'reject',
    responseMessage?: string,
  ): Promise<any> {
    const qs = new URLSearchParams({ action });
    if (responseMessage) qs.set('response_message', responseMessage);
    return this.request(
      `/api/v1/enrollments/enrollments/${enrollmentId}/respond?${qs.toString()}`,
      { method: 'PATCH' },
    );
  }

  async createTeacherSession(sessionData: any): Promise<any> {
    return this.request("/api/v1/teachers/sessions", {
      method: "POST",
      body: JSON.stringify(sessionData),
    });
  }

  async updateTeacherSession(
    sessionId: string,
    sessionData: any
  ): Promise<any> {
    return this.request(`/api/v1/teachers/sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify(sessionData),
    });
  }

  async updateSessionStatus(sessionId: string, status: string): Promise<any> {
    return this.request(
      `/api/v1/teachers/sessions/${sessionId}/status?status_update=${status}`,
      {
        method: "PUT",
      }
    );
  }

  async deleteTeacherSession(sessionId: string): Promise<any> {
    return this.request(`/api/v1/teachers/sessions/${sessionId}`, {
      method: "DELETE",
    });
  }

  async getSessionParticipants(sessionId: string): Promise<any> {
    return this.request(`/api/v1/teachers/sessions/${sessionId}/participants`);
  }

  async addSessionParticipant(
    sessionId: string,
    studentId: string
  ): Promise<any> {
    return this.request(
      `/api/v1/teachers/sessions/${sessionId}/participants/${studentId}`,
      {
        method: "POST",
      }
    );
  }

  async removeSessionParticipant(
    sessionId: string,
    studentId: string
  ): Promise<any> {
    return this.request(
      `/api/v1/teachers/sessions/${sessionId}/participants/${studentId}`,
      {
        method: "DELETE",
      }
    );
  }

  async updateSessionRecording(
    sessionId: string,
    recordingUrl: string,
    expiresAt?: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append("recording_url", recordingUrl);
    if (expiresAt) {
      formData.append("recording_expires_at", expiresAt);
    }

    return this.request(`/api/v1/teachers/sessions/${sessionId}/recording`, {
      method: "PUT",
      body: formData,
    });
  }

  async deleteSessionRecording(sessionId: string): Promise<any> {
    return this.request(`/api/v1/teachers/sessions/${sessionId}/recording`, {
      method: "DELETE",
    });
  }

  async getSessionAnalytics(sessionId: string): Promise<any> {
    return this.request(`/api/v1/teachers/sessions/${sessionId}/analytics`);
  }

  async getTeacherStudents(): Promise<any> {
    try {
      return await this.request("/api/v1/teachers/students");
    } catch (error) {
      console.warn("Main students endpoint failed, trying REST fallback...");
      try {
        return await this.request("/api/v1/teachers/students/rest");
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  /** Content items for one of the teacher's courses. Native Phoenix route,
   *  returns raw `course_content` rows (field names match the table exactly). */
  async getTeacherContent(
    courseId: string,
    params: { content_type?: string; access_level?: string; page?: number; limit?: number } = {}
  ): Promise<{ success: boolean; content: any[]; total_count: number; page: number; limit: number }> {
    const qs = new URLSearchParams({ course_id: courseId });
    if (params.content_type) qs.set("content_type", params.content_type);
    if (params.access_level) qs.set("access_level", params.access_level);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    return this.request(`/api/v1/teachers/content?${qs.toString()}`);
  }

  async getTeacherCoursesList(): Promise<any> {
    try {
      return await this.request("/api/v1/teachers/courses/list");
    } catch (error) {
      console.warn("Main courses list endpoint failed, trying REST fallback...");
      try {
        const response = await this.request("/api/v1/teachers/courses/rest");
        return response;
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async addStudentToCourse(
    studentEmail: string,
    courseId: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append("student_email", studentEmail);
    formData.append("course_id", courseId);

    return this.request("/api/v1/teachers/students/add", {
      method: "POST",
      body: formData,
    });
  }

  async sendMessageToStudent(
    studentId: string,
    messageContent: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append("student_id", studentId);
    formData.append("message_content", messageContent);

    return this.request("/api/v1/teachers/students/message", {
      method: "POST",
      body: formData,
    });
  }

  async sendEmailToStudent(
    studentId: string,
    subject: string,
    body: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append("student_id", studentId);
    formData.append("email_subject", subject);
    formData.append("email_body", body);

    return this.request("/api/v1/teachers/students/email", {
      method: "POST",
      body: formData,
    });
  }

  async generateStudentReport(
    reportType: string,
    format: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<Blob> {
    const formData = new FormData();
    formData.append("report_type", reportType);
    formData.append("format", format);
    if (dateFrom) formData.append("date_from", dateFrom);
    if (dateTo) formData.append("date_to", dateTo);

    const url = `${this.baseURL}/api/v1/teachers/students/report`;
    const token = this.ensureToken();
    const config: RequestInit = {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
      },
      body: formData,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch (e) {
      }
      throw new Error(errorMessage);
    }

    return response.blob();
  }

  async getTeacherEarnings(): Promise<any> {
    return this.request("/api/v1/teachers/earnings");
  }

  async getTeacherAnalytics(period: string = "month"): Promise<any> {
    return this.request(`/api/v1/teachers/analytics?period=${period}`);
  }

  async getTeacherEvents(): Promise<any> {
    return this.request("/api/v1/teachers/events");
  }

  async createTeacherEvent(eventData: any): Promise<any> {
    return this.request("/api/v1/teachers/events", {
      method: "POST",
      body: JSON.stringify(eventData),
    });
  }

  async updateTeacherEvent(eventId: string, eventData: any): Promise<any> {
    return this.request(`/api/v1/teachers/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(eventData),
    });
  }

  async deleteTeacherEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/teachers/events/${eventId}`, {
      method: "DELETE",
    });
  }


  async getTeacherEventCategories(): Promise<any> {
    return this.request("/api/v1/teachers/events/categories");
  }

  async createEventCategory(categoryData: {
    name: string;
    description: string;
    color?: string;
    icon?: string;
  }): Promise<any> {
    const formData = new FormData();
    formData.append("name", categoryData.name);
    formData.append("description", categoryData.description);
    if (categoryData.color) formData.append("color", categoryData.color);
    if (categoryData.icon) formData.append("icon", categoryData.icon);

    return this.request("/api/v1/teachers/events/categories", {
      method: "POST",
      body: formData,
    });
  }

  async getEventTemplates(): Promise<any> {
    return this.request("/api/v1/teachers/events/templates");
  }

  async createEventFromTemplate(templateData: {
    template_id: string;
    title: string;
    start_date: string;
    end_date: string;
    location?: string;
    custom_description?: string;
    max_attendees?: number;
    price?: number;
  }): Promise<any> {
    const formData = new FormData();
    formData.append("template_id", templateData.template_id);
    formData.append("title", templateData.title);
    formData.append("start_date", templateData.start_date);
    formData.append("end_date", templateData.end_date);
    if (templateData.location)
      formData.append("location", templateData.location);
    if (templateData.custom_description)
      formData.append("custom_description", templateData.custom_description);
    if (templateData.max_attendees)
      formData.append("max_attendees", templateData.max_attendees.toString());
    if (templateData.price !== undefined)
      formData.append("price", templateData.price.toString());

    return this.request("/api/v1/teachers/events/from-template", {
      method: "POST",
      body: formData,
    });
  }

  async getEventRegistrations(eventId: string): Promise<any> {
    return this.request(`/api/v1/teachers/events/${eventId}/registrations`);
  }

  async registerUserForEvent(
    eventId: string,
    registrationData: {
      user_email: string;
      notes?: string;
    }
  ): Promise<any> {
    const formData = new FormData();
    formData.append("user_email", registrationData.user_email);
    if (registrationData.notes)
      formData.append("notes", registrationData.notes);

    return this.request(`/api/v1/teachers/events/${eventId}/registrations`, {
      method: "POST",
      body: formData,
    });
  }

  async updateEventStatus(
    eventId: string,
    statusData: {
      status: string;
      reason?: string;
      new_date?: string;
    }
  ): Promise<any> {
    const formData = new FormData();
    formData.append("status", statusData.status);
    if (statusData.reason) formData.append("reason", statusData.reason);
    if (statusData.new_date) formData.append("new_date", statusData.new_date);

    return this.request(`/api/v1/teachers/events/${eventId}/status`, {
      method: "PUT",
      body: formData,
    });
  }

  async getEventAnalytics(eventId: string): Promise<any> {
    return this.request(`/api/v1/teachers/events/${eventId}/analytics`);
  }

  async uploadPromotionalMaterial(
    eventId: string,
    materialData: {
      title: string;
      description?: string;
      material_type: string;
      file_url: string;
    }
  ): Promise<any> {
    const formData = new FormData();
    formData.append("title", materialData.title);
    if (materialData.description)
      formData.append("description", materialData.description);
    formData.append("material_type", materialData.material_type);
    formData.append("file_url", materialData.file_url);

    return this.request(
      `/api/v1/teachers/events/${eventId}/promotional-material`,
      {
        method: "POST",
        body: formData,
      }
    );
  }

  async archiveEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/teachers/events/${eventId}/archive`, {
      method: "POST",
    });
  }

  async getTeacherSponsorship(): Promise<any> {
    return this.request("/api/v1/teachers/sponsorship");
  }

  async createSponsorshipRequest(requestData: any): Promise<any> {
    return this.request("/api/v1/teachers/sponsorship", {
      method: "POST",
      body: JSON.stringify(requestData),
    });
  }

  async updateSponsorshipRequest(
    requestId: string,
    requestData: any
  ): Promise<any> {
    return this.request(`/api/v1/teachers/sponsorship/${requestId}`, {
      method: "PUT",
      body: JSON.stringify(requestData),
    });
  }

  async deleteSponsorshipRequest(requestId: string): Promise<any> {
    return this.request(`/api/v1/teachers/sponsorship/${requestId}`, {
      method: "DELETE",
    });
  }

  async updateStudentProgress(
    studentId: string,
    progressPercentage: number,
    notes?: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append("progress_percentage", progressPercentage.toString());
    if (notes) {
      formData.append("notes", notes);
    }

    return this.request(`/api/v1/teachers/students/${studentId}/progress`, {
      method: "PUT",
      body: formData,
    });
  }

  async getTeacherNotifications(): Promise<any> {
    try {
      return await this.request("/api/v1/teachers/notifications");
    } catch (error) {
      console.warn("Main notifications endpoint failed, trying REST fallback...");
      try {
        return await this.request("/api/v1/teachers/notifications/rest");
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async markNotificationRead(notificationId: string): Promise<any> {
    return this.request(
      `/api/v1/teachers/notifications/${notificationId}/read`,
      {
        method: "PUT",
      }
    );
  }

  async markAllNotificationsRead(): Promise<any> {
    return this.request("/api/v1/teachers/notifications/mark-all-read", {
      method: "PUT",
    });
  }

  async getStudentDashboard(): Promise<any> {
    return this.request("/api/v1/students/dashboard");
  }

  async getStudentProfile(): Promise<any> {
    return this.request("/api/v1/students/profile");
  }

  async updateStudentProfile(profileData: any): Promise<any> {
    return this.request("/api/v1/students/profile", {
      method: "PUT",
      body: JSON.stringify(profileData),
    });
  }

  async findTeachers(
    params: {
      search?: string;
      subject?: string;
      min_rating?: number;
      max_rate?: number;
      online_only?: boolean;
      teacher_id?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/api/v1/students/find-teachers${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async getSubjectsForStudents(): Promise<any> {
    return this.request("/api/v1/students/subjects");
  }

  async getTeacherReviews(teacherId: string): Promise<{
    success: boolean;
    reviews: Array<{ id: string; rating: number; title?: string; content?: string; created_at: string; reviewer_name: string }>;
  }> {
    return this.request(`/api/v1/teachers/${encodeURIComponent(teacherId)}/reviews`);
  }

  /** Submit (or update, if the student already reviewed this teacher) a
   *  review. Requires the student to be enrolled in one of the teacher's
   *  courses — enforced server-side. */
  async submitTeacherReview(payload: {
    teacher_id: string;
    rating: number;
    title?: string;
    content?: string;
    course_id?: string;
  }): Promise<{ success: boolean; review: any }> {
    return this.request("/api/v1/students/reviews", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async contactTeacher(
    teacherId: string,
    message: string,
    subject: string = "General Inquiry"
  ): Promise<any> {
    const formData = new FormData();
    formData.append("teacher_id", teacherId);
    formData.append("message", message);
    formData.append("subject", subject);

    return this.request("/api/v1/students/contact-teacher", {
      method: "POST",
      body: formData,
    });
  }

  async getEnrolledCourses(): Promise<any[]> {
    return this.request<any[]>("/api/v1/students/enrolled-courses");
  }

  async getLiveSessions(
    params: {
      status_filter?: string;
      subject_filter?: string;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/api/v1/students/live-sessions${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async getSessionRecordings(
    params: {
      subject_filter?: string;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/api/v1/students/session-recordings${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async joinSession(sessionId: string): Promise<any> {
    return this.request(`/api/v1/students/join-session/${sessionId}`, {
      method: "POST",
    });
  }

  async setSessionReminder(sessionId: string): Promise<any> {
    return this.request(`/api/v1/students/set-reminder/${sessionId}`, {
      method: "POST",
    });
  }

  async getContentLibrary(
    params: {
      search?: string;
      category?: string;
      content_type?: string;
      access_level?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/api/v1/students/content-library${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async getContentCategories(): Promise<any> {
    return this.request("/api/v1/students/content-categories");
  }

  async getContentDetails(contentId: string): Promise<any> {
    return this.request(`/api/v1/students/content/${contentId}`);
  }

  async updateContentProgress(
    contentId: string,
    progressData: {
      progress_percentage?: number;
      time_spent_minutes?: number;
      is_completed?: boolean;
    }
  ): Promise<any> {
    return this.request(`/api/v1/students/content/${contentId}/progress`, {
      method: "POST",
      body: JSON.stringify(progressData),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }


  async getConversations(): Promise<any> {
    return this.request("/api/v1/students/conversations");
  }

  async getConversationMessages(
    conversationId: string,
    params: {
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/api/v1/students/conversations/${conversationId}/messages${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async sendMessage(conversationId: string, content: string): Promise<any> {
    return this.request(
      `/api/v1/students/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    );
  }

  async createConversation(teacherId: string, message: string): Promise<any> {
    return this.request("/api/v1/students/conversations", {
      method: "POST",
      body: JSON.stringify({
        teacher_id: teacherId,
        message: message,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /** Start (or reuse) a 1-1 conversation with another user. Backend
   *  endpoint at `/students/conversations` accepts `user_id` and is
   *  idempotent — returns the existing conversation id if one exists. */
  async startConversationWith(
    otherUserId: string,
  ): Promise<{ success: boolean; data: { id: string }; message?: string }> {
    return this.request("/api/v1/students/conversations", {
      method: "POST",
      body: JSON.stringify({ user_id: otherUserId }),
      headers: { "Content-Type": "application/json" },
    });
  }


  async getTeacherSchedule(): Promise<any> {
    try {
      return await this.request("/api/v1/teachers/schedule");
    } catch (error) {
      console.warn("Main schedule endpoint failed, trying REST fallback...");
      try {
        return await this.request("/api/v1/teachers/schedule/rest");
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async createAppointment(appointmentData: {
    title: string;
    description?: string;
    student_email: string;
    scheduled_start: string;
    scheduled_end: string;
    location?: string;
    is_online: boolean;
    meeting_link?: string;
    appointment_type: string;
  }): Promise<any> {
    const formData = new FormData();
    formData.append("title", appointmentData.title);
    if (appointmentData.description)
      formData.append("description", appointmentData.description);
    formData.append("student_email", appointmentData.student_email);
    formData.append("scheduled_start", appointmentData.scheduled_start);
    formData.append("scheduled_end", appointmentData.scheduled_end);
    if (appointmentData.location)
      formData.append("location", appointmentData.location);
    formData.append("is_online", appointmentData.is_online.toString());
    if (appointmentData.meeting_link)
      formData.append("meeting_link", appointmentData.meeting_link);
    formData.append("appointment_type", appointmentData.appointment_type);

    return this.request("/api/v1/teachers/appointments", {
      method: "POST",
      body: formData,
    });
  }

  async updateAppointment(
    appointmentId: string,
    updateData: {
      title?: string;
      description?: string;
      scheduled_start?: string;
      scheduled_end?: string;
      location?: string;
      meeting_link?: string;
      status?: string;
    }
  ): Promise<any> {
    const formData = new FormData();
    if (updateData.title !== undefined)
      formData.append("title", updateData.title);
    if (updateData.description !== undefined)
      formData.append("description", updateData.description);
    if (updateData.scheduled_start)
      formData.append("scheduled_start", updateData.scheduled_start);
    if (updateData.scheduled_end)
      formData.append("scheduled_end", updateData.scheduled_end);
    if (updateData.location !== undefined)
      formData.append("location", updateData.location);
    if (updateData.meeting_link !== undefined)
      formData.append("meeting_link", updateData.meeting_link);
    if (updateData.status) formData.append("status", updateData.status);

    return this.request(`/api/v1/teachers/appointments/${appointmentId}`, {
      method: "PUT",
      body: formData,
    });
  }

  async deleteAppointment(appointmentId: string): Promise<any> {
    return this.request(`/api/v1/teachers/appointments/${appointmentId}`, {
      method: "DELETE",
    });
  }

  async createAvailabilityBlock(availabilityData: {
    title: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
    is_recurring: boolean;
    specific_date?: string;
    buffer_minutes?: number;
    notes?: string;
  }): Promise<any> {
    const formData = new FormData();
    formData.append("title", availabilityData.title);
    formData.append("day_of_week", availabilityData.day_of_week);
    formData.append("start_time", availabilityData.start_time);
    formData.append("end_time", availabilityData.end_time);
    formData.append("is_recurring", availabilityData.is_recurring.toString());
    if (availabilityData.specific_date)
      formData.append("specific_date", availabilityData.specific_date);
    if (availabilityData.buffer_minutes)
      formData.append(
        "buffer_minutes",
        availabilityData.buffer_minutes.toString()
      );
    if (availabilityData.notes)
      formData.append("notes", availabilityData.notes);

    return this.request("/api/v1/teachers/availability", {
      method: "POST",
      body: formData,
    });
  }

  async updateAvailabilityBlock(
    blockId: string,
    updateData: {
      title?: string;
      start_time?: string;
      end_time?: string;
      status?: string;
      notes?: string;
    }
  ): Promise<any> {
    const formData = new FormData();
    if (updateData.title) formData.append("title", updateData.title);
    if (updateData.start_time)
      formData.append("start_time", updateData.start_time);
    if (updateData.end_time) formData.append("end_time", updateData.end_time);
    if (updateData.status) formData.append("status", updateData.status);
    if (updateData.notes !== undefined)
      formData.append("notes", updateData.notes);

    return this.request(`/api/v1/teachers/availability/${blockId}`, {
      method: "PUT",
      body: formData,
    });
  }

  async deleteAvailabilityBlock(blockId: string): Promise<any> {
    return this.request(`/api/v1/teachers/availability/${blockId}`, {
      method: "DELETE",
    });
  }

  async checkScheduleConflicts(
    startTime: string,
    endTime: string,
    excludeSessionId?: string
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("start_time", startTime);
    params.append("end_time", endTime);
    if (excludeSessionId) params.append("exclude_session_id", excludeSessionId);

    return this.request(
      `/api/v1/teachers/schedule/conflicts?${params.toString()}`
    );
  }

  async bulkApplyScheduleTemplate(templateData: {
    template_id: string;
    start_date: string;
    weeks_count: number;
  }): Promise<any> {
    const formData = new FormData();
    formData.append("template_id", templateData.template_id);
    formData.append("start_date", templateData.start_date);
    formData.append("weeks_count", templateData.weeks_count.toString());

    return this.request("/api/v1/teachers/schedule/bulk-apply-template", {
      method: "POST",
      body: formData,
    });
  }

  async bulkRescheduleAppointments(rescheduleData: {
    session_ids: string[];
    time_offset_hours: number;
  }): Promise<any> {
    const formData = new FormData();
    rescheduleData.session_ids.forEach((id) =>
      formData.append("session_ids[]", id)
    );
    formData.append(
      "time_offset_hours",
      rescheduleData.time_offset_hours.toString()
    );

    return this.request("/api/v1/teachers/schedule/bulk-reschedule", {
      method: "POST",
      body: formData,
    });
  }

  async getSubjects(): Promise<any[]> {
    return this.request<any[]>("/api/v1/subjects/");
  }

  async getSubjectCategories(): Promise<any[]> {
    return this.request<any[]>("/api/v1/subjects/categories");
  }


  async getEvents(
    params: {
      search?: string;
      category?: string;
      location?: string;
      price_filter?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.search && params.search.trim())
      searchParams.append("search", params.search.trim());
    if (params.category && params.category !== "all")
      searchParams.append("category", params.category);
    if (params.location && params.location !== "all")
      searchParams.append("location", params.location);
    if (params.price_filter && params.price_filter !== "all")
      searchParams.append("price_filter", params.price_filter);
    if (params.page && params.page > 0)
      searchParams.append("page", params.page.toString());
    if (params.limit && params.limit > 0)
      searchParams.append("limit", params.limit.toString());

    const url = `/api/v1/students/events${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async getEventCategories(): Promise<any> {
    return this.request("/api/v1/students/events/categories");
  }

  async registerForEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/students/events/${eventId}/register`, {
      method: "POST",
    });
  }

  async unregisterFromEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/students/events/${eventId}/register`, {
      method: "DELETE",
    });
  }

  async bookmarkEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/students/events/${eventId}/bookmark`, {
      method: "POST",
    });
  }

  async removeBookmarkEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/students/events/${eventId}/bookmark`, {
      method: "DELETE",
    });
  }


  async getPaymentHistory(
    params: {
      search?: string;
      status_filter?: string;
      type_filter?: string;
      date_range?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.search && params.search.trim())
      searchParams.append("search", params.search.trim());
    if (params.status_filter && params.status_filter !== "all")
      searchParams.append("status_filter", params.status_filter);
    if (params.type_filter && params.type_filter !== "all")
      searchParams.append("type_filter", params.type_filter);
    if (params.date_range && params.date_range !== "all")
      searchParams.append("date_range", params.date_range);
    if (params.page && params.page > 0)
      searchParams.append("page", params.page.toString());
    if (params.limit && params.limit > 0)
      searchParams.append("limit", params.limit.toString());

    const url = `/api/v1/students/payment-history${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async downloadPaymentReceipt(paymentId: string): Promise<Blob> {
    const token = this.ensureToken();
    const response = await fetch(
      `${this.baseURL}/api/v1/students/payment-history/${paymentId}/receipt`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download receipt: ${response.statusText}`);
    }

    return response.blob();
  }


  async getForumPosts(
    params: {
      search?: string;
      category?: string;
      sort_by?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.search && params.search.trim())
      searchParams.append("search", params.search.trim());
    if (params.category && params.category !== "all")
      searchParams.append("category", params.category);
    if (params.sort_by) searchParams.append("sort_by", params.sort_by);
    if (params.page && params.page > 0)
      searchParams.append("page", params.page.toString());
    if (params.limit && params.limit > 0)
      searchParams.append("limit", params.limit.toString());

    const url = `/api/v1/students/forum/posts${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;
    return this.request(url);
  }

  async getForumPost(postId: string): Promise<any> {
    return this.request(`/api/v1/students/forum/posts/${postId}`);
  }

  async getForumCategories(): Promise<any> {
    return this.request("/api/v1/students/forum/categories");
  }

  async getForumStats(): Promise<any> {
    return this.request("/api/v1/students/forum/stats");
  }

  async createForumPost(postData: {
    title: string;
    content: string;
    category: string;
    tags: string[];
  }): Promise<any> {
    return this.request("/api/v1/students/forum/posts", {
      method: "POST",
      body: JSON.stringify(postData),
    });
  }

  async voteOnPost(
    postId: string,
    voteType: "upvote" | "downvote"
  ): Promise<any> {
    return this.request(`/api/v1/students/forum/posts/${postId}/vote`, {
      method: "POST",
      body: JSON.stringify({ vote_type: voteType }),
    });
  }

  async createForumReply(postId: string, content: string): Promise<any> {
    return this.request(`/api/v1/students/forum/posts/${postId}/replies`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async getSponsorDashboard(): Promise<any> {
    try {
      return await this.request("/api/v1/sponsors/dashboard", {
        method: "GET",
      });
    } catch (error) {
      console.warn("Main sponsor dashboard endpoint failed, trying REST fallback...");
      try {
        return await this.request("/api/v1/sponsors/dashboard/rest", {
          method: "GET",
        });
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async getSponsorCampaigns(params: SponsorCampaignsParams = {}): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.status_filter && params.status_filter !== "all") {
      searchParams.append("status_filter", params.status_filter);
    }
    if (params.page) {
      searchParams.append("page", params.page.toString());
    }
    if (params.limit) {
      searchParams.append("limit", params.limit.toString());
    }

    const queryString = searchParams.toString();
    const url = `/api/v1/sponsors/campaigns${queryString ? `?${queryString}` : ""
      }`;

    try {
      return await this.request(url, {
        method: "GET",
      });
    } catch (error) {
      console.warn("Main sponsor campaigns endpoint failed, trying REST fallback...");
      try {
        const restParams = new URLSearchParams();
        if (params.page) restParams.append("page", params.page.toString());
        if (params.limit) restParams.append("limit", params.limit.toString());
        const restUrl = `/api/v1/sponsors/campaigns/rest${restParams.toString() ? `?${restParams.toString()}` : ""}`;
        return await this.request(restUrl, {
          method: "GET",
        });
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async getSponsorEvents(params: SponsorEventsParams = {}): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.status_filter && params.status_filter !== "all") {
      searchParams.append("status_filter", params.status_filter);
    }
    if (params.upcoming !== undefined) {
      searchParams.append("upcoming", params.upcoming.toString());
    }
    if (params.page) {
      searchParams.append("page", params.page.toString());
    }
    if (params.limit) {
      searchParams.append("limit", params.limit.toString());
    }

    const queryString = searchParams.toString();
    const url = `/api/v1/sponsors/events${queryString ? `?${queryString}` : ""
      }`;

    try {
      return await this.request(url, {
        method: "GET",
      });
    } catch (error) {
      console.warn("Main sponsor events endpoint failed, trying REST fallback...");
      try {
        const restParams = new URLSearchParams();
        if (params.page) restParams.append("page", params.page.toString());
        if (params.limit) restParams.append("limit", params.limit.toString());
        const restUrl = `/api/v1/sponsors/events/rest${restParams.toString() ? `?${restParams.toString()}` : ""}`;
        return await this.request(restUrl, {
          method: "GET",
        });
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async getSponsorRecentImpact(days: number = 30): Promise<any> {
    return this.request(`/api/v1/sponsors/recent-impact?days=${days}`, {
      method: "GET",
    });
  }


  async createSponsorEvent(eventData: CreateSponsorEventData): Promise<any> {
    return this.request("/api/v1/sponsors/events", {
      method: "POST",
      body: JSON.stringify(eventData),
    });
  }

  async getSponsorEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/sponsors/events/${eventId}`, {
      method: "GET",
    });
  }

  async updateSponsorEvent(
    eventId: string,
    eventData: UpdateSponsorEventData
  ): Promise<any> {
    return this.request(`/api/v1/sponsors/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(eventData),
    });
  }

  async deleteSponsorEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/sponsors/events/${eventId}`, {
      method: "DELETE",
    });
  }

  async launchSponsorEvent(eventId: string): Promise<any> {
    return this.request(`/api/v1/sponsors/events/${eventId}/launch`, {
      method: "PUT",
    });
  }

  async getSponsorshipRequests(
    params: SponsorshipRequestsParams = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.status_filter && params.status_filter !== "all") {
      searchParams.append("status_filter", params.status_filter);
    }
    if (params.category_filter && params.category_filter !== "all") {
      searchParams.append("category_filter", params.category_filter);
    }
    if (params.search) {
      searchParams.append("search", params.search);
    }
    if (params.page) {
      searchParams.append("page", params.page.toString());
    }
    if (params.limit) {
      searchParams.append("limit", params.limit.toString());
    }

    const queryString = searchParams.toString();
    const url = `/api/v1/sponsors/sponsorship-requests${queryString ? `?${queryString}` : ""
      }`;
    const fallbackUrl = `/api/v1/sponsors/sponsorship-requests/rest${queryString ? `?${queryString}` : ""
      }`;

    try {
      return await this.request(url, {
        method: "GET",
      });
    } catch (error) {
      console.warn(
        "Main sponsorship requests endpoint failed, trying REST fallback..."
      );
      try {
        return await this.request(fallbackUrl, {
          method: "GET",
        });
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }

  async updateSponsorshipRequestStatus(
    requestId: string,
    status: string,
    notes?: string
  ): Promise<any> {
    return this.request(
      `/api/v1/sponsors/sponsorship-requests/${requestId}/status`,
      {
        method: "PUT",
        body: JSON.stringify({ status, notes }),
      }
    );
  }

  async getDetailedCampaigns(
    params: {
      status_filter?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    if (params.status_filter && params.status_filter !== "all") {
      searchParams.append("status_filter", params.status_filter);
    }
    if (params.page) {
      searchParams.append("page", params.page.toString());
    }
    if (params.limit) {
      searchParams.append("limit", params.limit.toString());
    }

    const queryString = searchParams.toString();
    const url = `/api/v1/sponsors/campaigns/detailed${queryString ? `?${queryString}` : ""
      }`;

    return this.request(url, {
      method: "GET",
    });
  }

  async createCampaign(campaignData: CreateCampaignData): Promise<any> {
    return this.request("/api/v1/sponsors/campaigns", {
      method: "POST",
      body: JSON.stringify(campaignData),
    });
  }

  async updateCampaign(
    campaignId: string,
    campaignData: UpdateCampaignData
  ): Promise<any> {
    return this.request(`/api/v1/sponsors/campaigns/${campaignId}`, {
      method: "PUT",
      body: JSON.stringify(campaignData),
    });
  }

  async deleteCampaign(campaignId: string): Promise<any> {
    return this.request(`/api/v1/sponsors/campaigns/${campaignId}`, {
      method: "DELETE",
    });
  }

  async getSponsorAnalytics(timeRange: string = "last-30-days"): Promise<any> {
    const url = `/api/v1/sponsors/analytics?time_range=${timeRange}`;
    const fallbackUrl = `/api/v1/sponsors/analytics/rest?time_range=${timeRange}`;

    try {
      return await this.request(url, {
        method: "GET",
      });
    } catch (error) {
      console.warn(
        "Main analytics endpoint failed, trying REST fallback..."
      );
      try {
        return await this.request(fallbackUrl, {
          method: "GET",
        });
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw restError;
      }
    }
  }

  async getStudentWishlist(): Promise<{
    success: boolean;
    data: Array<{
      wishlist_id: string;
      course_id: string;
      title: string;
      description?: string;
      thumbnail_url?: string;
      price: number;
      teacher_name: string;
      subject: string;
      added_at: string;
    }>;
  }> {
    return this.request("/api/v1/students/wishlist");
  }

  async addToWishlist(courseId: string): Promise<{ success: boolean; message: string; id: string }> {
    return this.request("/api/v1/students/wishlist", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId }),
    });
  }

  async removeFromWishlist(courseId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/v1/students/wishlist/${encodeURIComponent(courseId)}`, {
      method: "DELETE",
    });
  }

  async getTeacherPaymentHistory(
    params: {
      search?: string;
      status_filter?: string;
      type_filter?: string;
      date_range?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();
    if (params.search && params.search.trim())
      searchParams.append("search", params.search.trim());
    if (params.status_filter && params.status_filter !== "all")
      searchParams.append("status_filter", params.status_filter);
    if (params.type_filter && params.type_filter !== "all")
      searchParams.append("type_filter", params.type_filter);
    if (params.date_range && params.date_range !== "all")
      searchParams.append("date_range", params.date_range);
    if (params.page && params.page > 0)
      searchParams.append("page", params.page.toString());
    if (params.limit && params.limit > 0)
      searchParams.append("limit", params.limit.toString());
    const url = `/api/v1/teachers/payments${searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;

    try {
      return await this.request(url);
    } catch (error) {
      console.warn("Main payments endpoint failed, trying REST fallback...");
      try {
        const restParams = new URLSearchParams();
        if (params.page) restParams.append("page", params.page.toString());
        if (params.limit) restParams.append("limit", params.limit.toString());
        const restUrl = `/api/v1/teachers/payments/rest${restParams.toString() ? `?${restParams.toString()}` : ""}`;
        return await this.request(restUrl);
      } catch (restError) {
        console.error("REST fallback also failed:", restError);
        throw error;
      }
    }
  }


  async listMyScholarships(statusFilter?: string): Promise<{ scholarships: any[] }> {
    const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
    return this.request(`/api/v1/sponsors/scholarships${qs}`);
  }

  async createScholarship(payload: any): Promise<{ scholarship: any }> {
    return this.request(`/api/v1/sponsors/scholarships`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getMyScholarship(id: string): Promise<{ scholarship: any }> {
    return this.request(`/api/v1/sponsors/scholarships/${id}`);
  }

  async updateScholarship(id: string, payload: any): Promise<{ scholarship: any }> {
    return this.request(`/api/v1/sponsors/scholarships/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async deleteScholarship(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/v1/sponsors/scholarships/${id}`, {
      method: "DELETE",
    });
  }

  async listScholarshipApplications(
    scholarshipId: string,
    statusFilter?: string,
  ): Promise<{ applications: any[] }> {
    const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
    return this.request(`/api/v1/sponsors/scholarships/${scholarshipId}/applications${qs}`);
  }

  async reviewScholarshipApplication(
    applicationId: string,
    payload: { action: "approve" | "reject"; reviewer_notes?: string; grant_amount_lkr?: number },
  ): Promise<any> {
    return this.request(`/api/v1/sponsors/scholarship-applications/${applicationId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async listMyAccessCodes(): Promise<{ access_codes: any[] }> {
    return this.request(`/api/v1/sponsors/access-codes`);
  }

  async createAccessCodes(payload: {
    value_lkr: number;
    quantity?: number;
    max_uses?: number;
    label?: string;
    expires_at?: string;
  }): Promise<{ access_codes: any[] }> {
    return this.request(`/api/v1/sponsors/access-codes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async revokeAccessCode(id: string): Promise<{ revoked: boolean }> {
    return this.request(`/api/v1/sponsors/access-codes/${id}`, { method: "DELETE" });
  }

  async listOpenScholarships(): Promise<{ scholarships: any[] }> {
    return this.request(`/api/v1/students/scholarships`);
  }

  async getOpenScholarship(id: string): Promise<{ scholarship: any }> {
    return this.request(`/api/v1/students/scholarships/${id}`);
  }

  async applyToScholarship(
    id: string,
    payload: {
      statement_of_need?: string;
      family_income_lkr?: number;
      school?: string;
      grade?: string;
    },
  ): Promise<{ application: any }> {
    return this.request(`/api/v1/students/scholarships/${id}/apply`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listMyScholarshipApplications(): Promise<{ applications: any[] }> {
    return this.request(`/api/v1/students/scholarship-applications`);
  }

  async listMyFundingGrants(): Promise<{ grants: any[] }> {
    return this.request(`/api/v1/students/funding-grants`);
  }

  async redeemAccessCode(code: string): Promise<{ grant: any; value_lkr: number }> {
    return this.request(`/api/v1/students/redeem-access-code`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  async consumeGrantForSession(
    sessionId: string,
    grantId: string,
  ): Promise<{ message: string; payment: any; grant_id: string; can_join_session: boolean }> {
    return this.request(`/api/v1/payments/scholarship-grant`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, grant_id: grantId }),
    });
  }

  async getPayHereStatus(): Promise<{ enabled: boolean; sandbox: boolean | null }> {
    return this.request(`/api/v1/payments/payhere/status`);
  }

  async initiatePayHerePayment(sessionId: string): Promise<{
    enabled: boolean;
    fallback?: string;
    already_paid?: boolean;
    order_id?: string;
    checkout?: Record<string, string>;
    payment?: any;
    message?: string;
  }> {
    return this.request(
      `/api/v1/payments/sessions/${encodeURIComponent(sessionId)}/payhere/initiate`,
      { method: "POST" },
    );
  }

  /**
   * Redirect the browser to PayHere by auto-submitting the signed checkout
   * payload as a form. `checkout.action` is the gateway URL; every other key
   * (merchant_id, order_id, amount, hash, …) is a hidden field PayHere reads.
   */
  redirectToPayHere(checkout: Record<string, string>): void {
    if (typeof document === "undefined") return;
    const { action, ...fields } = checkout;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = action;
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value ?? "";
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }


  async getNotifications(params: { limit?: number; unread_only?: boolean } = {}): Promise<{
    notifications: any[];
    unread_count: number;
    total_count: number;
  }> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.unread_only) qs.set("unread_only", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/api/v1/notifications/${suffix}`);
  }

  async markNotificationReadGeneric(notificationId: string): Promise<{ message: string }> {
    return this.request(`/api/v1/notifications/${notificationId}/read`, {
      method: "PATCH",
    });
  }

  async markAllNotificationsReadGeneric(): Promise<{ message: string }> {
    return this.request(`/api/v1/notifications/mark-all-read`, {
      method: "PATCH",
    });
  }

  async deleteNotification(notificationId: string): Promise<{ message: string }> {
    return this.request(`/api/v1/notifications/${notificationId}`, {
      method: "DELETE",
    });
  }


  async sendAIChat(payload: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    language?: string;
  }): Promise<{
    reply: string;
    model?: string;
    cache_read_input_tokens?: number;
    offline?: boolean;
  }> {
    return this.request(`/api/v1/chat/chat`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export const apiClient = new APIClient(API_BASE_URL);

export const isAuthenticated = (): boolean => {
  return (
    typeof window !== "undefined" && !!localStorage.getItem("access_token")
  );
};

export const getCurrentUser = (): User | null => {
  if (typeof window !== "undefined") {
    const userStr = localStorage.getItem("current_user");
    return userStr ? JSON.parse(userStr) : null;
  }
  return null;
};

export const setCurrentUser = (user: User): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem("current_user", JSON.stringify(user));
  }
};
