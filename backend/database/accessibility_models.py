"""
Accessibility Models for Inclusive Education Platform

This module defines the database models for comprehensive accessibility support,
including student disability profiles, accessibility preferences, teacher specializations,
and related configurations.

Supported Disabilities:
- Dyslexia
- Dysgraphia
- Dyscalculia
- ADHD
- Autism Spectrum Disorder (ASD)
- Intellectual Disability
- Specific Learning Disorder (SLD)
- Visual Impairment (Low Vision, Blind)
- Hearing Impairment (Hard of Hearing, Deaf)
- Physical Disability (Mobility limitations)
- Color Vision Deficiency (Protanopia, Deuteranopia, Tritanopia, Achromatopsia)
"""

from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, ForeignKey, ARRAY, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import uuid



DISABILITY_TYPES = [
    'dyslexia',
    'dysgraphia',
    'dyscalculia',
    'adhd',
    'asd',
    'intellectual_disability',
    'sld',
    'visual_impairment_low_vision',
    'visual_impairment_blind',
    'hearing_impairment_hard_of_hearing',
    'hearing_impairment_deaf',
    'physical_disability_mobility',
    'physical_disability_no_limbs',
    'color_vision_protanopia',
    'color_vision_deuteranopia',
    'color_vision_tritanopia',
    'color_vision_achromatopsia',
    'color_vision_protanomaly',
    'color_vision_deuteranomaly',
    'color_vision_tritanomaly',
]

SEVERITY_LEVELS = ['mild', 'moderate', 'severe']

FONT_FAMILIES = [
    'system',
    'opendyslexic',
    'lexie_readable',
    'comic_sans',
    'arial',
    'verdana',
    'tahoma',
    'trebuchet',
    'atkinson_hyperlegible',
]

COLOR_SCHEMES = [
    'default',
    'high_contrast_dark',
    'high_contrast_light',
    'low_contrast',
    'warm_tones',
    'cool_tones',
    'custom',
]

READING_MODES = [
    'standard',
    'simplified',
    'visual_first',
    'audio_primary',
    'step_by_step',
]

TEACHER_SPECIALIZATIONS = [
    'general_education',
    'special_education',
    'dyslexia_specialist',
    'adhd_specialist',
    'asd_specialist',
    'visual_impairment_specialist',
    'hearing_impairment_specialist',
    'physical_disability_specialist',
    'speech_language_pathologist',
    'occupational_therapist',
    'behavioral_specialist',
    'inclusive_education',
]



class StudentDisabilityProfile(Base):
    """
    Stores comprehensive disability information for students.
    This is a confidential record used to personalize the learning experience.
    """
    __tablename__ = "student_disability_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)

    has_disability = Column(Boolean, default=False)
    disability_types = Column(ARRAY(Text), default=[])
    primary_disability = Column(String(100))
    severity_levels = Column(JSONB, default={})

    professionally_diagnosed = Column(Boolean, default=False)
    diagnosis_date = Column(DateTime)
    iep_status = Column(Boolean, default=False)
    accommodation_letter = Column(Boolean, default=False)

    guardian_consent = Column(Boolean, default=False)
    guardian_email = Column(String(255))
    guardian_phone = Column(String(50))
    guardian_relationship = Column(String(50))

    additional_needs = Column(Text)
    medical_notes = Column(Text)

    share_with_teachers = Column(Boolean, default=True)
    share_with_sponsors = Column(Boolean, default=False)

    onboarding_completed = Column(Boolean, default=False)
    last_assessment_date = Column(DateTime)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    user = relationship("User")
    accessibility_preferences = relationship("AccessibilityPreferences", back_populates="disability_profile", uselist=False)


class AccessibilityPreferences(Base):
    """
    Comprehensive accessibility preferences for UI/UX adaptation.
    Linked to disability profile but also usable by neurotypical students.
    """
    __tablename__ = "accessibility_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    disability_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_disability_profiles.id"))

    font_family = Column(String(50), default='system')
    font_size = Column(Integer, default=100)
    font_weight = Column(String(20), default='normal')
    letter_spacing = Column(Float, default=0)
    word_spacing = Column(Float, default=0)
    line_height = Column(Float, default=1.5)

    color_scheme = Column(String(50), default='default')
    background_color = Column(String(20), default='#ffffff')
    text_color = Column(String(20), default='#1a1a1a')
    link_color = Column(String(20), default='#0066cc')
    highlight_color = Column(String(20), default='#ffff00')

    color_blind_mode = Column(String(50), default='none')
    color_blind_strength = Column(Integer, default=100)

    high_contrast = Column(Boolean, default=False)
    contrast_level = Column(Integer, default=100)
    brightness_level = Column(Integer, default=100)
    invert_colors = Column(Boolean, default=False)

    reduced_motion = Column(Boolean, default=False)
    disable_animations = Column(Boolean, default=False)
    disable_auto_play = Column(Boolean, default=True)
    disable_parallax = Column(Boolean, default=False)

    simplified_ui = Column(Boolean, default=False)
    large_click_targets = Column(Boolean, default=False)
    sticky_navigation = Column(Boolean, default=True)
    breadcrumbs_enabled = Column(Boolean, default=True)

    reading_mode = Column(String(50), default='standard')
    reading_guide = Column(Boolean, default=False)
    reading_ruler = Column(Boolean, default=False)
    text_mask = Column(Boolean, default=False)
    focus_highlight = Column(Boolean, default=False)

    screen_reader_optimized = Column(Boolean, default=False)
    text_to_speech = Column(Boolean, default=False)
    tts_voice = Column(String(50), default='default')
    tts_speed = Column(Float, default=1.0)
    tts_pitch = Column(Float, default=1.0)
    audio_descriptions = Column(Boolean, default=True)

    auto_captions = Column(Boolean, default=True)
    sign_language_videos = Column(Boolean, default=False)
    simplified_language = Column(Boolean, default=False)
    visual_learning_mode = Column(Boolean, default=False)
    step_by_step_mode = Column(Boolean, default=False)

    focus_mode = Column(Boolean, default=False)
    break_reminders = Column(Boolean, default=False)
    break_interval_minutes = Column(Integer, default=25)
    progress_indicators = Column(Boolean, default=True)
    chunked_content = Column(Boolean, default=False)
    cognitive_load_indicator = Column(Boolean, default=False)

    keyboard_navigation = Column(Boolean, default=False)
    voice_input = Column(Boolean, default=False)
    switch_access = Column(Boolean, default=False)
    touch_accommodations = Column(Boolean, default=False)
    extended_time_default = Column(Boolean, default=False)

    math_visualization = Column(Boolean, default=False)
    calculator_always_visible = Column(Boolean, default=False)
    number_line_helper = Column(Boolean, default=False)
    step_by_step_math = Column(Boolean, default=False)

    spell_check_enhanced = Column(Boolean, default=True)
    grammar_suggestions = Column(Boolean, default=True)
    word_prediction = Column(Boolean, default=False)
    speech_to_text = Column(Boolean, default=False)

    quiet_mode = Column(Boolean, default=False)
    notification_sounds = Column(Boolean, default=True)
    visual_notifications = Column(Boolean, default=True)
    haptic_feedback = Column(Boolean, default=False)

    active_preset = Column(String(50), default='custom')
    custom_presets = Column(JSONB, default={})

    last_modified = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    sync_across_devices = Column(Boolean, default=True)

    user = relationship("User")
    disability_profile = relationship("StudentDisabilityProfile", back_populates="accessibility_preferences")


class AccessibilityPreset(Base):
    """
    Pre-configured accessibility presets for different disability types.
    These serve as templates for quick setup.
    """
    __tablename__ = "accessibility_presets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    disability_type = Column(String(100))
    is_system_preset = Column(Boolean, default=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    settings = Column(JSONB, nullable=False)

    usage_count = Column(Integer, default=0)
    average_rating = Column(Float, default=0)

    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())



class TeacherSpecialization(Base):
    """
    Teacher's specializations for working with students with disabilities.
    """
    __tablename__ = "teacher_specializations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("teacher_profiles.id"), nullable=False)

    specializations = Column(ARRAY(Text), default=[])
    disability_experience = Column(ARRAY(Text), default=[])

    certifications = Column(JSONB, default=[])
    training_completed = Column(JSONB, default=[])
    years_special_education = Column(Integer, default=0)

    teaching_methods = Column(ARRAY(Text), default=[])
    accommodation_strategies = Column(JSONB, default={})
    assistive_tech_proficiency = Column(ARRAY(Text), default=[])

    sign_language_proficiency = Column(String(50))
    braille_proficiency = Column(String(50))
    aac_experience = Column(Boolean, default=False)

    accepts_iep_students = Column(Boolean, default=True)
    max_special_needs_students = Column(Integer, default=5)

    inclusion_rating = Column(Float, default=0)
    inclusion_reviews_count = Column(Integer, default=0)

    verified_specialist = Column(Boolean, default=False)
    verification_date = Column(DateTime)
    verified_by = Column(String(255))

    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    teacher = relationship("TeacherProfile")


class TeacherAccessibilityTraining(Base):
    """
    Track teacher's accessibility and inclusion training.
    """
    __tablename__ = "teacher_accessibility_training"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("teacher_profiles.id"), nullable=False)

    training_name = Column(String(255), nullable=False)
    training_provider = Column(String(255))
    training_type = Column(String(100))
    disability_focus = Column(ARRAY(Text), default=[])

    completed_date = Column(DateTime)
    expiry_date = Column(DateTime)
    certificate_url = Column(Text)
    hours_completed = Column(Integer)

    created_at = Column(DateTime, server_default=func.current_timestamp())

    teacher = relationship("TeacherProfile")



class CourseAccessibilityInfo(Base):
    """
    Accessibility information and accommodations for courses.
    """
    __tablename__ = "course_accessibility_info"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, unique=True)

    has_captions = Column(Boolean, default=False)
    has_transcripts = Column(Boolean, default=False)
    has_audio_description = Column(Boolean, default=False)
    has_sign_language = Column(Boolean, default=False)
    has_simplified_version = Column(Boolean, default=False)
    has_visual_version = Column(Boolean, default=False)

    reading_level = Column(String(50))
    available_formats = Column(ARRAY(Text), default=[])

    suitable_for = Column(ARRAY(Text), default=[])
    not_recommended_for = Column(ARRAY(Text), default=[])

    allows_extended_time = Column(Boolean, default=True)
    flexible_deadlines = Column(Boolean, default=False)
    self_paced = Column(Boolean, default=False)

    break_friendly = Column(Boolean, default=True)
    cognitive_load_level = Column(String(20), default='medium')
    requires_fine_motor = Column(Boolean, default=False)
    requires_audio = Column(Boolean, default=False)
    requires_video = Column(Boolean, default=False)

    accommodation_notes = Column(Text)

    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    course = relationship("Course")


class StudentCourseAccommodation(Base):
    """
    Specific accommodations granted to a student for a course.
    """
    __tablename__ = "student_course_accommodations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("teacher_profiles.id"), nullable=False)

    extended_time_percentage = Column(Integer, default=0)
    flexible_deadlines = Column(Boolean, default=False)
    alternative_assignments = Column(Boolean, default=False)
    note_taking_assistance = Column(Boolean, default=False)
    recording_allowed = Column(Boolean, default=True)

    simplified_content = Column(Boolean, default=False)
    audio_version = Column(Boolean, default=False)
    large_print = Column(Boolean, default=False)

    oral_exams_allowed = Column(Boolean, default=False)
    calculator_allowed = Column(Boolean, default=True)
    formula_sheet_allowed = Column(Boolean, default=False)
    breaks_during_exams = Column(Boolean, default=True)
    separate_testing_room = Column(Boolean, default=False)

    custom_accommodations = Column(JSONB, default={})

    status = Column(String(50), default='pending')
    approved_by = Column(UUID(as_uuid=True))
    approved_at = Column(DateTime)
    expires_at = Column(DateTime)

    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    student = relationship("User")
    course = relationship("Course")
    teacher = relationship("TeacherProfile")



class GuardianLink(Base):
    """
    Links guardians/parents to student accounts for monitoring.
    """
    __tablename__ = "guardian_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    guardian_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    guardian_email = Column(String(255), nullable=False)
    guardian_name = Column(String(255))
    guardian_phone = Column(String(50))
    relationship = Column(String(50))

    can_view_progress = Column(Boolean, default=True)
    can_view_grades = Column(Boolean, default=True)
    can_view_accessibility = Column(Boolean, default=True)
    can_communicate_teachers = Column(Boolean, default=True)
    can_modify_accessibility = Column(Boolean, default=False)
    receives_reports = Column(Boolean, default=True)
    report_frequency = Column(String(20), default='weekly')

    is_verified = Column(Boolean, default=False)
    verification_code = Column(String(100))
    verified_at = Column(DateTime)

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    student = relationship("User", foreign_keys=[student_id])
    guardian = relationship("User", foreign_keys=[guardian_id])


class AccessibilityProgressReport(Base):
    """
    Regular progress reports sent to guardians about accessibility and learning.
    """
    __tablename__ = "accessibility_progress_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    guardian_link_id = Column(UUID(as_uuid=True), ForeignKey("guardian_links.id"))

    report_period_start = Column(DateTime, nullable=False)
    report_period_end = Column(DateTime, nullable=False)

    courses_active = Column(Integer, default=0)
    courses_completed = Column(Integer, default=0)
    average_progress = Column(Float, default=0)
    study_hours = Column(Float, default=0)

    accessibility_features_used = Column(JSONB, default={})
    accommodations_utilized = Column(JSONB, default={})

    session_count = Column(Integer, default=0)
    average_session_duration = Column(Float, default=0)
    break_compliance = Column(Float, default=0)

    teacher_notes = Column(JSONB, default=[])

    report_content = Column(JSONB)
    report_url = Column(Text)

    sent_at = Column(DateTime)
    viewed_at = Column(DateTime)

    created_at = Column(DateTime, server_default=func.current_timestamp())

    student = relationship("User")
    guardian_link = relationship("GuardianLink")



class AccessibilityUsageLog(Base):
    """
    Track usage of accessibility features for analytics and improvement.
    """
    __tablename__ = "accessibility_usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    feature_name = Column(String(100), nullable=False)
    feature_category = Column(String(50))

    action = Column(String(50))
    old_value = Column(Text)
    new_value = Column(Text)

    context_page = Column(String(255))
    session_id = Column(String(100))

    created_at = Column(DateTime, server_default=func.current_timestamp())

    user = relationship("User")
