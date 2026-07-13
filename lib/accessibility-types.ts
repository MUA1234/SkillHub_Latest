/**
 * Accessibility Types for SkillHub Inclusive Education Platform
 *
 * This file defines all TypeScript types for the accessibility system,
 * including disability profiles, preferences, presets, and teacher specializations.
 */


export type DisabilityCategory =
  | 'learning'
  | 'cognitive'
  | 'developmental'
  | 'visual'
  | 'hearing'
  | 'physical'
  | 'color_vision';

export type DisabilityType =
  | 'dyslexia'
  | 'dysgraphia'
  | 'dyscalculia'
  | 'adhd'
  | 'asd'
  | 'intellectual_disability'
  | 'sld'
  | 'visual_impairment_low_vision'
  | 'visual_impairment_blind'
  | 'hearing_impairment_hard_of_hearing'
  | 'hearing_impairment_deaf'
  | 'physical_disability_mobility'
  | 'physical_disability_no_limbs'
  | 'color_vision_protanopia'
  | 'color_vision_deuteranopia'
  | 'color_vision_tritanopia'
  | 'color_vision_achromatopsia'
  | 'color_vision_protanomaly'
  | 'color_vision_deuteranomaly'
  | 'color_vision_tritanomaly';

export type SeverityLevel = 'mild' | 'moderate' | 'severe';

export interface DisabilityTypeInfo {
  id: DisabilityType;
  name: string;
  category: DisabilityCategory;
  description: string;
}


export type FontFamily =
  | 'system'
  | 'opendyslexic'
  | 'lexie_readable'
  | 'comic_sans'
  | 'arial'
  | 'verdana'
  | 'tahoma'
  | 'trebuchet'
  | 'atkinson_hyperlegible';

export type ColorScheme =
  | 'default'
  | 'high_contrast_dark'
  | 'high_contrast_light'
  | 'low_contrast'
  | 'warm_tones'
  | 'cool_tones'
  | 'custom';

export type ColorBlindMode =
  | 'none'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'achromatopsia'
  | 'protanomaly'
  | 'deuteranomaly'
  | 'tritanomaly';

export type ReadingMode =
  | 'standard'
  | 'simplified'
  | 'visual_first'
  | 'audio_primary'
  | 'step_by_step';


export interface DisabilityProfile {
  id: string;
  user_id: string;
  has_disability: boolean;
  disability_types: DisabilityType[];
  primary_disability: DisabilityType | null;
  severity_levels: Record<DisabilityType, SeverityLevel>;
  professionally_diagnosed: boolean;
  diagnosis_date: string | null;
  iep_status: boolean;
  accommodation_letter: boolean;
  guardian_consent: boolean;
  guardian_email: string | null;
  guardian_phone: string | null;
  guardian_relationship: string | null;
  additional_needs: string | null;
  medical_notes: string | null;
  share_with_teachers: boolean;
  share_with_sponsors: boolean;
  onboarding_completed: boolean;
  last_assessment_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisabilityProfileCreate {
  has_disability: boolean;
  disability_types: DisabilityType[];
  primary_disability?: DisabilityType | null;
  severity_levels?: Record<string, SeverityLevel>;
  professionally_diagnosed?: boolean;
  diagnosis_date?: string | null;
  iep_status?: boolean;
  accommodation_letter?: boolean;
  guardian_consent?: boolean;
  guardian_email?: string | null;
  guardian_phone?: string | null;
  guardian_relationship?: string | null;
  additional_needs?: string | null;
  share_with_teachers?: boolean;
  share_with_sponsors?: boolean;
}


export interface AccessibilityPreferences {
  id?: string;
  user_id?: string;

  font_family: FontFamily;
  font_size: number;
  font_weight: 'normal' | 'bold';
  letter_spacing: number;
  word_spacing: number;
  line_height: number;

  color_scheme: ColorScheme;
  background_color: string;
  text_color: string;
  link_color: string;
  highlight_color: string;

  color_blind_mode: ColorBlindMode;
  color_blind_strength: number;

  high_contrast: boolean;
  contrast_level: number;
  brightness_level: number;
  invert_colors: boolean;

  reduced_motion: boolean;
  disable_animations: boolean;
  disable_auto_play: boolean;
  disable_parallax: boolean;

  simplified_ui: boolean;
  large_click_targets: boolean;
  sticky_navigation: boolean;
  breadcrumbs_enabled: boolean;

  reading_mode: ReadingMode;
  reading_guide: boolean;
  reading_ruler: boolean;
  text_mask: boolean;
  focus_highlight: boolean;

  screen_reader_optimized: boolean;
  text_to_speech: boolean;
  tts_voice: string;
  tts_speed: number;
  tts_pitch: number;
  audio_descriptions: boolean;

  auto_captions: boolean;
  sign_language_videos: boolean;
  simplified_language: boolean;
  visual_learning_mode: boolean;
  step_by_step_mode: boolean;

  focus_mode: boolean;
  break_reminders: boolean;
  break_interval_minutes: number;
  progress_indicators: boolean;
  chunked_content: boolean;
  cognitive_load_indicator: boolean;

  keyboard_navigation: boolean;
  voice_input: boolean;
  switch_access: boolean;
  touch_accommodations: boolean;
  extended_time_default: boolean;

  math_visualization: boolean;
  calculator_always_visible: boolean;
  number_line_helper: boolean;
  step_by_step_math: boolean;

  spell_check_enhanced: boolean;
  grammar_suggestions: boolean;
  word_prediction: boolean;
  speech_to_text: boolean;

  quiet_mode: boolean;
  notification_sounds: boolean;
  visual_notifications: boolean;
  haptic_feedback: boolean;

  active_preset: string;
  custom_presets?: Record<string, Partial<AccessibilityPreferences>>;

  low_bandwidth_mode?: boolean;

  last_modified?: string;
  sync_across_devices?: boolean;
}

export type AccessibilityPreferencesUpdate = Partial<AccessibilityPreferences>;


export interface AccessibilityPreset {
  id: string;
  name: string;
  description: string;
  disability_type: DisabilityType | null;
  is_system_preset: boolean;
  created_by: string | null;
  settings: Partial<AccessibilityPreferences>;
  usage_count: number;
  average_rating: number;
  created_at: string;
  updated_at: string;
}


export type TeacherSpecializationType =
  | 'general_education'
  | 'special_education'
  | 'dyslexia_specialist'
  | 'adhd_specialist'
  | 'asd_specialist'
  | 'visual_impairment_specialist'
  | 'hearing_impairment_specialist'
  | 'physical_disability_specialist'
  | 'speech_language_pathologist'
  | 'occupational_therapist'
  | 'behavioral_specialist'
  | 'inclusive_education';

export type ProficiencyLevel = 'none' | 'basic' | 'intermediate' | 'fluent';

export interface Certification {
  name: string;
  issuer: string;
  date_obtained: string;
  expiry_date?: string;
  certificate_url?: string;
}

export interface TrainingCourse {
  name: string;
  provider: string;
  completed_date: string;
  hours: number;
  disability_focus: DisabilityType[];
}

export interface TeacherSpecialization {
  id: string;
  teacher_id: string;
  specializations: TeacherSpecializationType[];
  disability_experience: DisabilityType[];
  certifications: Certification[];
  training_completed: TrainingCourse[];
  years_special_education: number;
  teaching_methods: string[];
  accommodation_strategies: Record<DisabilityType, string[]>;
  assistive_tech_proficiency: string[];
  sign_language_proficiency: ProficiencyLevel;
  braille_proficiency: ProficiencyLevel;
  aac_experience: boolean;
  accepts_iep_students: boolean;
  max_special_needs_students: number;
  inclusion_rating: number;
  inclusion_reviews_count: number;
  verified_specialist: boolean;
  verification_date: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeacherSpecializationCreate {
  specializations: TeacherSpecializationType[];
  disability_experience: DisabilityType[];
  certifications?: Certification[];
  training_completed?: TrainingCourse[];
  years_special_education?: number;
  teaching_methods?: string[];
  accommodation_strategies?: Record<string, string[]>;
  assistive_tech_proficiency?: string[];
  sign_language_proficiency?: ProficiencyLevel;
  braille_proficiency?: ProficiencyLevel;
  aac_experience?: boolean;
  accepts_iep_students?: boolean;
  max_special_needs_students?: number;
}


export interface GuardianLink {
  id: string;
  student_id: string;
  guardian_id: string | null;
  guardian_email: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  relationship: string | null;
  can_view_progress: boolean;
  can_view_grades: boolean;
  can_view_accessibility: boolean;
  can_communicate_teachers: boolean;
  can_modify_accessibility: boolean;
  receives_reports: boolean;
  report_frequency: 'daily' | 'weekly' | 'monthly';
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuardianLinkCreate {
  guardian_email: string;
  guardian_name?: string;
  guardian_phone?: string;
  relationship?: string;
  can_view_progress?: boolean;
  can_view_grades?: boolean;
  can_view_accessibility?: boolean;
  can_communicate_teachers?: boolean;
  can_modify_accessibility?: boolean;
  receives_reports?: boolean;
  report_frequency?: 'daily' | 'weekly' | 'monthly';
}


export interface CourseAccessibilityInfo {
  id: string;
  course_id: string;
  has_captions: boolean;
  has_transcripts: boolean;
  has_audio_description: boolean;
  has_sign_language: boolean;
  has_simplified_version: boolean;
  has_visual_version: boolean;
  reading_level: string;
  available_formats: string[];
  suitable_for: DisabilityType[];
  not_recommended_for: DisabilityType[];
  allows_extended_time: boolean;
  flexible_deadlines: boolean;
  self_paced: boolean;
  break_friendly: boolean;
  cognitive_load_level: 'low' | 'medium' | 'high';
  requires_fine_motor: boolean;
  requires_audio: boolean;
  requires_video: boolean;
  accommodation_notes: string | null;
}


export interface StudentCourseAccommodation {
  id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  extended_time_percentage: number;
  flexible_deadlines: boolean;
  alternative_assignments: boolean;
  note_taking_assistance: boolean;
  recording_allowed: boolean;
  simplified_content: boolean;
  audio_version: boolean;
  large_print: boolean;
  oral_exams_allowed: boolean;
  calculator_allowed: boolean;
  formula_sheet_allowed: boolean;
  breaks_during_exams: boolean;
  separate_testing_room: boolean;
  custom_accommodations: Record<string, any>;
  status: 'pending' | 'approved' | 'active' | 'expired';
  approved_by: string | null;
  approved_at: string | null;
  expires_at: string | null;
}


export interface AccessibilityResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface OnboardingStatus {
  onboarding_completed: boolean;
  has_profile: boolean;
}


export const defaultAccessibilityPreferences: AccessibilityPreferences = {
  font_family: 'system',
  font_size: 100,
  font_weight: 'normal',
  letter_spacing: 0,
  word_spacing: 0,
  line_height: 1.5,

  color_scheme: 'default',
  background_color: '#ffffff',
  text_color: '#1a1a1a',
  link_color: '#0066cc',
  highlight_color: '#ffff00',

  color_blind_mode: 'none',
  color_blind_strength: 100,

  high_contrast: false,
  contrast_level: 100,
  brightness_level: 100,
  invert_colors: false,

  reduced_motion: false,
  disable_animations: false,
  disable_auto_play: true,
  disable_parallax: false,

  simplified_ui: false,
  large_click_targets: false,
  sticky_navigation: true,
  breadcrumbs_enabled: true,

  reading_mode: 'standard',
  reading_guide: false,
  reading_ruler: false,
  text_mask: false,
  focus_highlight: false,

  screen_reader_optimized: false,
  text_to_speech: false,
  tts_voice: 'default',
  tts_speed: 1.0,
  tts_pitch: 1.0,
  audio_descriptions: true,

  auto_captions: true,
  sign_language_videos: false,
  simplified_language: false,
  visual_learning_mode: false,
  step_by_step_mode: false,

  focus_mode: false,
  break_reminders: false,
  break_interval_minutes: 25,
  progress_indicators: true,
  chunked_content: false,
  cognitive_load_indicator: false,

  keyboard_navigation: false,
  voice_input: false,
  switch_access: false,
  touch_accommodations: false,
  extended_time_default: false,

  math_visualization: false,
  calculator_always_visible: false,
  number_line_helper: false,
  step_by_step_math: false,

  spell_check_enhanced: true,
  grammar_suggestions: true,
  word_prediction: false,
  speech_to_text: false,

  quiet_mode: false,
  notification_sounds: true,
  visual_notifications: true,
  haptic_feedback: false,

  active_preset: 'custom',
};


export const getDisabilityCategoryColor = (category: DisabilityCategory): string => {
  const colors: Record<DisabilityCategory, string> = {
    learning: '#3B82F6',
    cognitive: '#8B5CF6',
    developmental: '#EC4899',
    visual: '#F59E0B',
    hearing: '#10B981',
    physical: '#EF4444',
    color_vision: '#6366F1',
  };
  return colors[category] || '#6B7280';
};

export const getDisabilityIcon = (type: DisabilityType): string => {
  const icons: Partial<Record<DisabilityType, string>> = {
    dyslexia: '📖',
    dysgraphia: '✍️',
    dyscalculia: '🔢',
    adhd: '🎯',
    asd: '🧩',
    visual_impairment_low_vision: '👁️',
    visual_impairment_blind: '🦯',
    hearing_impairment_hard_of_hearing: '👂',
    hearing_impairment_deaf: '🤟',
    physical_disability_mobility: '♿',
    color_vision_protanopia: '🌈',
  };
  return icons[type] || '♿';
};
