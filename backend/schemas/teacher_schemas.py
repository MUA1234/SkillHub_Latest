from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class SubjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None

class Subject(SubjectBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    created_at: datetime

class SubjectTagBase(BaseModel):
    tag_name: str

class SubjectTagCreate(SubjectTagBase):
    subject_id: UUID

class SubjectTag(SubjectTagBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    subject_id: UUID
    created_at: datetime

class TeacherProfileBase(BaseModel):
    title: Optional[str] = None
    experience_years: Optional[int] = None
    hourly_rate: Optional[Decimal] = None
    languages: Optional[List[str]] = []
    specializations: Optional[List[str]] = []
    achievements: Optional[List[str]] = []
    teaching_style: Optional[str] = None
    is_online_available: bool = True
    is_physical_available: bool = True
    response_time: Optional[str] = None
    availability_status: str = "Available"
    collaboration_interests: Optional[List[str]] = []

class TeacherProfileCreate(TeacherProfileBase):
    pass

class TeacherProfileUpdate(TeacherProfileBase):
    pass

class TeacherProfile(TeacherProfileBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    is_verified: bool
    total_students: int
    total_reviews: int
    average_rating: Decimal
    created_at: datetime
    updated_at: datetime

class TeacherSubjectBase(BaseModel):
    proficiency_level: Optional[str] = None

class TeacherSubjectCreate(TeacherSubjectBase):
    teacher_id: UUID
    subject_id: UUID

class TeacherSubjectUpdate(TeacherSubjectBase):
    pass

class TeacherSubject(TeacherSubjectBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    teacher_id: UUID
    subject_id: UUID
    created_at: datetime
    subject: Optional[Subject] = None

class TeacherSubjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    teacher_id: UUID
    subject_id: UUID
    proficiency_level: Optional[str] = None
    created_at: datetime
    subject: Optional[Subject] = None

class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    subject_id: Optional[UUID] = None
    level: Optional[str] = None
    duration_weeks: Optional[int] = None
    price: Optional[Decimal] = None
    original_price: Optional[Decimal] = None
    max_students: Optional[int] = None
    status: str = "draft"
    thumbnail_url: Optional[str] = None
    is_featured: bool = False
    tags: Optional[List[str]] = []

class CourseCreate(CourseBase):
    pass

class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject_id: Optional[UUID] = None
    level: Optional[str] = None
    duration_weeks: Optional[int] = None
    price: Optional[Decimal] = None
    original_price: Optional[Decimal] = None
    max_students: Optional[int] = None
    status: Optional[str] = None
    thumbnail_url: Optional[str] = None
    is_featured: Optional[bool] = None
    tags: Optional[List[str]] = None

class Course(CourseBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    teacher_id: UUID
    created_at: datetime
    updated_at: datetime
    subject: Optional[Subject] = None

class CourseContentBase(BaseModel):
    title: str
    description: Optional[str] = None
    content_type: str
    content_url: Optional[str] = None
    duration: Optional[str] = None
    file_size: Optional[str] = None
    access_level: str = "free"
    order_index: Optional[int] = None
    is_downloadable: bool = False

class CourseContentCreate(CourseContentBase):
    course_id: UUID

class CourseContentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content_url: Optional[str] = None
    duration: Optional[str] = None
    file_size: Optional[str] = None
    access_level: Optional[str] = None
    order_index: Optional[int] = None
    is_downloadable: Optional[bool] = None

class CourseContent(CourseContentBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    course_id: UUID
    created_at: datetime

class LiveSessionBase(BaseModel):
    title: str
    description: Optional[str] = None
    session_type: str
    session_mode: str = "online"
    scheduled_start: datetime
    scheduled_end: datetime
    status: str = "scheduled"
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    max_participants: Optional[int] = None
    recording_enabled: bool = True
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None

class LiveSessionCreate(LiveSessionBase):
    course_id: Optional[UUID] = None

class LiveSessionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    session_type: Optional[str] = None
    session_mode: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    status: Optional[str] = None
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    max_participants: Optional[int] = None
    recording_enabled: Optional[bool] = None
    is_recurring: Optional[bool] = None
    recurrence_pattern: Optional[str] = None

class LiveSession(LiveSessionBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    teacher_id: UUID
    course_id: Optional[UUID] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    current_participants: int
    recording_url: Optional[str] = None
    recording_expires_at: Optional[datetime] = None
    created_at: datetime

class SessionParticipantBase(BaseModel):
    joined_at: Optional[datetime] = None
    left_at: Optional[datetime] = None
    attendance_duration_minutes: int = 0

class SessionParticipantCreate(SessionParticipantBase):
    session_id: UUID
    student_id: UUID

class SessionParticipant(SessionParticipantBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    session_id: UUID
    student_id: UUID
    created_at: datetime

class CourseEnrollmentBase(BaseModel):
    status: str = "pending"
    progress_percentage: int = 0
    payment_status: str = "pending"
    payment_amount: Optional[Decimal] = None

class CourseEnrollmentCreate(CourseEnrollmentBase):
    student_id: UUID
    course_id: UUID
    teacher_id: UUID

class CourseEnrollmentUpdate(BaseModel):
    status: Optional[str] = None
    progress_percentage: Optional[int] = None
    last_accessed: Optional[datetime] = None
    payment_status: Optional[str] = None
    payment_amount: Optional[Decimal] = None

class CourseEnrollment(CourseEnrollmentBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    student_id: UUID
    course_id: UUID
    teacher_id: UUID
    enrolled_at: datetime
    completed_at: Optional[datetime] = None
    last_accessed: Optional[datetime] = None

class StudentProgressBase(BaseModel):
    progress_percentage: int = 0
    time_spent_minutes: int = 0
    is_completed: bool = False

class StudentProgressCreate(StudentProgressBase):
    enrollment_id: UUID
    content_id: UUID

class StudentProgressUpdate(StudentProgressBase):
    pass

class StudentProgress(StudentProgressBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    enrollment_id: UUID
    content_id: UUID
    last_accessed: datetime

class PaymentBase(BaseModel):
    payment_type: str
    reference_id: UUID
    amount: Decimal
    currency: str = "LKR"
    status: str = "pending"
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    payment_gateway: Optional[str] = None

class PaymentCreate(PaymentBase):
    user_id: UUID

class Payment(PaymentBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    created_at: datetime
    processed_at: Optional[datetime] = None

class ReviewBase(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    title: Optional[str] = None
    content: Optional[str] = None

class ReviewCreate(ReviewBase):
    teacher_id: Optional[UUID] = None
    course_id: Optional[UUID] = None
    event_id: Optional[UUID] = None

class Review(ReviewBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    reviewer_id: UUID
    teacher_id: Optional[UUID] = None
    course_id: Optional[UUID] = None
    event_id: Optional[UUID] = None
    is_verified: bool
    created_at: datetime

class ExaminationBase(BaseModel):
    title: str
    description: Optional[str] = None
    exam_date: datetime
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None
    passing_marks: Optional[int] = None

class ExaminationCreate(ExaminationBase):
    course_id: UUID

class Examination(ExaminationBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    course_id: UUID
    teacher_id: UUID
    created_at: datetime

class DashboardMetricBase(BaseModel):
    metric_type: str
    metric_value: int = 0
    date_recorded: Optional[date] = None

class DashboardMetricCreate(DashboardMetricBase):
    user_id: UUID

class DashboardMetric(DashboardMetricBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    created_at: datetime

class TeacherDashboardStats(BaseModel):
    total_students: int
    total_courses: int
    active_sessions: int
    total_earnings: Decimal
    average_rating: Decimal
    total_reviews: int
    completed_sessions: int
    this_month_earnings: Decimal
    monthly_earnings: Optional[Decimal] = None

    def __init__(self, **data):
        if 'this_month_earnings' in data and 'monthly_earnings' not in data:
            data['monthly_earnings'] = data['this_month_earnings']
        super().__init__(**data)

class TeacherProfileResponse(BaseModel):
    profile: TeacherProfile
    subjects: List[TeacherSubjectResponse]
    stats: TeacherDashboardStats
    recent_reviews: List[Review]

class TeacherCoursesResponse(BaseModel):
    courses: List[Course]
    total_count: int
    active_count: int
    draft_count: int
    published_count: int

class TeacherSessionsResponse(BaseModel):
    sessions: List[LiveSession]
    total_count: int
    upcoming_count: int
    live_count: int
    completed_count: int

class StudentProfile(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    location: Optional[str] = None
    university: Optional[str] = None

class StudentInfo(BaseModel):
    id: UUID
    email: str
    profile: StudentProfile

class CourseInfo(BaseModel):
    id: UUID
    title: str
    level: Optional[str] = None
    price: Optional[Decimal] = None
    thumbnail_url: Optional[str] = None

class DetailedCourseEnrollment(BaseModel):
    id: UUID
    student_id: UUID
    course_id: UUID
    teacher_id: UUID
    status: str
    progress_percentage: int
    enrolled_at: datetime
    completed_at: Optional[datetime] = None
    last_accessed: Optional[datetime] = None
    payment_status: Optional[str] = None
    payment_amount: Optional[Decimal] = None
    student: StudentInfo
    course: CourseInfo

class TeacherStudentsResponse(BaseModel):
    enrollments: List[DetailedCourseEnrollment]
    total_students: int
    active_students: int
    completed_courses: int

class TeacherEarningsResponse(BaseModel):
    total_earnings: Decimal
    this_month_earnings: Decimal
    last_month_earnings: Decimal
    pending_payments: Decimal
    recent_payments: List[Payment]
    monthly_breakdown: List[Dict[str, Any]]

class TeacherAnalyticsResponse(BaseModel):
    period: str
    student_engagement: List[Dict[str, Any]]
    course_performance: List[Dict[str, Any]]
    session_analytics: List[Dict[str, Any]]
    earnings_trend: List[Dict[str, Any]]

class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    limit: int = Field(20, ge=1, le=100)
    sort_by: Optional[str] = "created_at"
    sort_order: Optional[str] = Field("desc", pattern="^(asc|desc)$")

class CourseFilter(BaseModel):
    status: Optional[str] = None
    subject_id: Optional[UUID] = None
    level: Optional[str] = None
    is_featured: Optional[bool] = None

class SessionFilter(BaseModel):
    status: Optional[str] = None
    session_type: Optional[str] = None
    course_id: Optional[UUID] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None

class StudentFilter(BaseModel):
    course_id: Optional[UUID] = None
    status: Optional[str] = None
    progress_min: Optional[int] = None
    progress_max: Optional[int] = None

class ContentFilter(BaseModel):
    course_id: Optional[UUID] = None
    content_type: Optional[str] = None
    access_level: Optional[str] = None

class FileUploadResponse(BaseModel):
    file_url: str
    file_size: int
    content_type: str
    upload_success: bool = True

class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    start_date: datetime
    end_date: datetime
    location: Optional[str] = None
    is_online: bool = True
    price: Optional[float] = 0
    original_price: Optional[float] = None
    max_attendees: Optional[int] = None
    image_url: Optional[str] = None
    tags: Optional[List[str]] = []
    level: Optional[str] = None
    languages: Optional[List[str]] = []
    has_certificate: bool = False
    sponsor: Optional[str] = None
    is_featured: bool = False

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None
    is_online: Optional[bool] = None
    price: Optional[float] = None
    original_price: Optional[float] = None
    max_attendees: Optional[int] = None
    image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    level: Optional[str] = None
    languages: Optional[List[str]] = None
    has_certificate: Optional[bool] = None
    sponsor: Optional[str] = None
    is_featured: Optional[bool] = None

class EventResponse(EventBase):
    id: UUID
    organizer_id: UUID
    current_attendees: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True

class EventRegistrationBase(BaseModel):
    attendance_status: str = 'registered'
    payment_status: str = 'pending'
    payment_amount: Optional[float] = None

class EventRegistrationCreate(EventRegistrationBase):
    event_id: UUID

class EventRegistrationResponse(EventRegistrationBase):
    id: UUID
    event_id: UUID
    user_id: UUID
    registration_date: datetime
    
    class Config:
        from_attributes = True

class TeacherEventsResponse(BaseModel):
    events: List[EventResponse]
    total_count: int
    upcoming_count: int
    past_count: int
    this_month_count: int
    my_events_count: int
    total_participants: int

class SponsorshipRequestBase(BaseModel):
    title: str
    description: Optional[str] = None
    amount_requested: float
    students_impacted: int = 0

class SponsorshipRequestCreate(SponsorshipRequestBase):
    pass

class SponsorshipRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    amount_requested: Optional[float] = None
    students_impacted: Optional[int] = None
    status: Optional[str] = None
    reviewer_notes: Optional[str] = None

class SponsorshipRequestResponse(SponsorshipRequestBase):
    id: UUID
    teacher_id: UUID
    status: str = 'pending'
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewer_notes: Optional[str] = None
    
    class Config:
        from_attributes = True

class TeacherSponsorshipResponse(BaseModel):
    requests: List[SponsorshipRequestResponse]
    total_count: int
    pending_count: int
    approved_count: int
    rejected_count: int
    total_requested: float
    total_approved: float 