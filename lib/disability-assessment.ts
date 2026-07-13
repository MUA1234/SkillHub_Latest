
export type DisabilityType =
  | 'dyslexia'
  | 'dysgraphia'
  | 'dyscalculia'
  | 'adhd'
  | 'asd'
  | 'intellectual_disability'
  | 'sld'
  | 'visual_impairment'
  | 'hearing_impairment'
  | 'physical_disability'
  | 'color_vision_deficiency';

export type ColorVisionType =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'none';

export type SeverityLevel = 'mild' | 'moderate' | 'severe';

export interface AssessmentQuestion {
  id: string;
  category: DisabilityType;
  subCategory?: ColorVisionType;
  text: string;
  helpText?: string;
  type: 'radio' | 'checkbox' | 'slider' | 'choice';
  options?: { value: string | number; label: string; score: number }[];
  sliderConfig?: {
    min: number;
    max: number;
    step: number;
    labels: { value: number; label: string }[];
  };
  weight: number;
}

export interface AssessmentSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  targetDisabilities: DisabilityType[];
  questions: AssessmentQuestion[];
}

export interface AssessmentResponse {
  questionId: string;
  value: string | number | string[];
  score: number;
}

export interface InferredDisability {
  type: DisabilityType;
  confidence: number;
  severity: SeverityLevel;
  subType?: ColorVisionType;
}

export interface AssessmentResult {
  responses: AssessmentResponse[];
  inferredDisabilities: InferredDisability[];
  adaptationProfile: AdaptationProfile;
  completedAt: string;
}

export interface AdaptationProfile {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
  textColor: string;
  backgroundColor: string;
  highContrast: boolean;
  colorFilter: ColorVisionType | 'none';

  reducedAnimations: boolean;
  focusMode: boolean;
  simplifiedUI: boolean;
  chunkContent: boolean;
  breakReminders: boolean;
  breakIntervalMinutes: number;

  readingGuide: boolean;
  readingRuler: boolean;
  textToSpeech: boolean;

  largeClickTargets: boolean;
  keyboardNavigation: boolean;
  voiceInput: boolean;
  extendedTimeouts: boolean;

  visualAlerts: boolean;
  captionsEnabled: boolean;
  signLanguageSupport: boolean;

  predictableLayout: boolean;
  reducedSensoryInput: boolean;
  clearNavigationCues: boolean;
}


export const ASSESSMENT_SECTIONS: AssessmentSection[] = [
  {
    id: 'reading_language',
    title: 'Reading & Language',
    description: 'Questions about reading, writing, and language processing',
    icon: '📖',
    targetDisabilities: ['dyslexia', 'dysgraphia', 'sld'],
    questions: [
      {
        id: 'rl_1',
        category: 'dyslexia',
        text: 'When reading, do letters or words seem to move, blur, or jump around?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'rl_2',
        category: 'dyslexia',
        text: 'Do you often mix up similar-looking letters (like b/d, p/q)?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'rl_3',
        category: 'dyslexia',
        text: 'How difficult is it for you to read long passages of text?',
        type: 'slider',
        sliderConfig: {
          min: 0,
          max: 10,
          step: 1,
          labels: [
            { value: 0, label: 'Not difficult' },
            { value: 5, label: 'Moderately difficult' },
            { value: 10, label: 'Very difficult' },
          ],
        },
        weight: 2,
      },
      {
        id: 'rl_4',
        category: 'dyslexia',
        text: 'Do you lose your place frequently while reading?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'rl_5',
        category: 'dysgraphia',
        text: 'How would you describe your handwriting?',
        type: 'radio',
        options: [
          { value: 'neat', label: 'Neat and consistent', score: 0 },
          { value: 'average', label: 'Average, sometimes messy', score: 1 },
          { value: 'inconsistent', label: 'Inconsistent spacing and size', score: 2 },
          { value: 'difficult', label: 'Very difficult to read', score: 3 },
          { value: 'avoid', label: 'I avoid writing by hand', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'rl_6',
        category: 'dysgraphia',
        text: 'Do you experience pain or fatigue when writing for extended periods?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'rl_7',
        category: 'dysgraphia',
        text: 'Do you have trouble organizing thoughts when writing essays or notes?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'rl_8',
        category: 'sld',
        text: 'Do you struggle with spelling common words?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
    ],
  },

  {
    id: 'math_numbers',
    title: 'Math & Numbers',
    description: 'Questions about working with numbers and mathematical concepts',
    icon: '🔢',
    targetDisabilities: ['dyscalculia'],
    questions: [
      {
        id: 'mn_1',
        category: 'dyscalculia',
        text: 'Do you have difficulty remembering number sequences (like phone numbers)?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'mn_2',
        category: 'dyscalculia',
        text: 'Do you struggle with mental math (calculating in your head)?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'mn_3',
        category: 'dyscalculia',
        text: 'Do you mix up mathematical symbols (+, -, ×, ÷)?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'mn_4',
        category: 'dyscalculia',
        text: 'How difficult is it for you to estimate quantities or time?',
        type: 'slider',
        sliderConfig: {
          min: 0,
          max: 10,
          step: 1,
          labels: [
            { value: 0, label: 'Easy' },
            { value: 5, label: 'Moderate' },
            { value: 10, label: 'Very difficult' },
          ],
        },
        weight: 2,
      },
      {
        id: 'mn_5',
        category: 'dyscalculia',
        text: 'Do you have trouble understanding graphs, charts, or tables?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
    ],
  },

  {
    id: 'attention_focus',
    title: 'Attention & Focus',
    description: 'Questions about concentration and attention patterns',
    icon: '🎯',
    targetDisabilities: ['adhd'],
    questions: [
      {
        id: 'af_1',
        category: 'adhd',
        text: 'How often do you have difficulty sustaining attention during tasks or activities?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'very_often', label: 'Very Often', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'af_2',
        category: 'adhd',
        text: 'Do you often feel restless or have difficulty sitting still?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'very_often', label: 'Very Often', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'af_3',
        category: 'adhd',
        text: 'How easily are you distracted by background noise or visual stimuli?',
        type: 'slider',
        sliderConfig: {
          min: 0,
          max: 10,
          step: 1,
          labels: [
            { value: 0, label: 'Not easily' },
            { value: 5, label: 'Somewhat' },
            { value: 10, label: 'Very easily' },
          ],
        },
        weight: 2,
      },
      {
        id: 'af_4',
        category: 'adhd',
        text: 'Do you often interrupt others or blurt out answers before questions are completed?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'very_often', label: 'Very Often', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'af_5',
        category: 'adhd',
        text: 'Do you have trouble organizing tasks and managing time?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'very_often', label: 'Very Often', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'af_6',
        category: 'adhd',
        text: 'Do you frequently lose things necessary for tasks (keys, phone, assignments)?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'very_often', label: 'Very Often', score: 4 },
        ],
        weight: 2,
      },
    ],
  },

  {
    id: 'social_sensory',
    title: 'Social & Sensory',
    description: 'Questions about social interactions and sensory experiences',
    icon: '🤝',
    targetDisabilities: ['asd'],
    questions: [
      {
        id: 'ss_1',
        category: 'asd',
        text: 'Do you prefer routines and find unexpected changes distressing?',
        type: 'radio',
        options: [
          { value: 'not_at_all', label: 'Not at all', score: 0 },
          { value: 'slightly', label: 'Slightly', score: 1 },
          { value: 'moderately', label: 'Moderately', score: 2 },
          { value: 'very_much', label: 'Very much', score: 3 },
          { value: 'extremely', label: 'Extremely', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'ss_2',
        category: 'asd',
        text: 'Do you find it difficult to understand non-verbal cues (facial expressions, body language)?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'ss_3',
        category: 'asd',
        text: 'Are you sensitive to certain sounds, lights, textures, or smells?',
        type: 'radio',
        options: [
          { value: 'not_at_all', label: 'Not at all', score: 0 },
          { value: 'slightly', label: 'Slightly', score: 1 },
          { value: 'moderately', label: 'Moderately', score: 2 },
          { value: 'very_much', label: 'Very sensitive', score: 3 },
          { value: 'extremely', label: 'Extremely sensitive', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'ss_4',
        category: 'asd',
        text: 'Do you have intense, focused interests in specific topics?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'somewhat', label: 'Somewhat', score: 1 },
          { value: 'yes', label: 'Yes', score: 2 },
          { value: 'very_intense', label: 'Very intense', score: 3 },
        ],
        weight: 2,
      },
      {
        id: 'ss_5',
        category: 'asd',
        text: 'Do you prefer clear, literal communication over hints or sarcasm?',
        type: 'radio',
        options: [
          { value: 'no_preference', label: 'No preference', score: 0 },
          { value: 'slight', label: 'Slight preference', score: 1 },
          { value: 'moderate', label: 'Moderate preference', score: 2 },
          { value: 'strong', label: 'Strong preference', score: 3 },
          { value: 'always', label: 'Always need literal', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'ss_6',
        category: 'asd',
        text: 'Do you find small talk or casual conversation challenging?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
    ],
  },

  {
    id: 'learning_processing',
    title: 'Learning & Processing',
    description: 'Questions about how you learn and process information',
    icon: '🧠',
    targetDisabilities: ['intellectual_disability', 'sld'],
    questions: [
      {
        id: 'lp_1',
        category: 'intellectual_disability',
        text: 'How much extra time do you typically need to understand new concepts compared to peers?',
        type: 'radio',
        options: [
          { value: 'none', label: 'Same as others', score: 0 },
          { value: 'little', label: 'A little more', score: 1 },
          { value: 'moderate', label: 'Noticeably more', score: 2 },
          { value: 'significant', label: 'Significantly more', score: 3 },
          { value: 'extensive', label: 'Much more time', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'lp_2',
        category: 'intellectual_disability',
        text: 'Do you need information broken into smaller, simpler steps?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'lp_3',
        category: 'intellectual_disability',
        text: 'Do you have difficulty with abstract concepts or problem-solving?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'lp_4',
        category: 'sld',
        text: 'Do you learn better through visual aids, audio, or hands-on activities?',
        helpText: 'This helps us understand your learning style',
        type: 'checkbox',
        options: [
          { value: 'visual', label: 'Visual (pictures, diagrams)', score: 1 },
          { value: 'audio', label: 'Audio (listening, discussion)', score: 1 },
          { value: 'hands_on', label: 'Hands-on (doing, practicing)', score: 1 },
          { value: 'reading', label: 'Reading/Writing', score: 0 },
        ],
        weight: 1,
      },
      {
        id: 'lp_5',
        category: 'sld',
        text: 'Do you have difficulty remembering information you just learned?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
    ],
  },

  {
    id: 'vision',
    title: 'Vision',
    description: 'Questions about your visual abilities',
    icon: '👁️',
    targetDisabilities: ['visual_impairment', 'color_vision_deficiency'],
    questions: [
      {
        id: 'vi_1',
        category: 'visual_impairment',
        text: 'Do you use glasses or contact lenses?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'reading', label: 'Yes, for reading', score: 1 },
          { value: 'distance', label: 'Yes, for distance', score: 1 },
          { value: 'always', label: 'Yes, all the time', score: 2 },
        ],
        weight: 1,
      },
      {
        id: 'vi_2',
        category: 'visual_impairment',
        text: 'Even with correction (glasses/contacts), how would you rate your vision?',
        type: 'radio',
        options: [
          { value: 'excellent', label: 'Excellent', score: 0 },
          { value: 'good', label: 'Good', score: 1 },
          { value: 'moderate', label: 'Moderate difficulty', score: 2 },
          { value: 'significant', label: 'Significant difficulty', score: 3 },
          { value: 'severe', label: 'Severe impairment / legally blind', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'vi_3',
        category: 'visual_impairment',
        text: 'Do you use screen magnification or zoom features?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'rarely', label: 'Rarely', score: 1 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'often', label: 'Often', score: 3 },
          { value: 'always', label: 'Always', score: 4 },
        ],
        weight: 2,
      },
      {
        id: 'vi_4',
        category: 'visual_impairment',
        text: 'Do you use a screen reader or text-to-speech software?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'occasionally', label: 'Occasionally', score: 2 },
          { value: 'frequently', label: 'Frequently', score: 3 },
          { value: 'always', label: 'Always / primary method', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'cv_1',
        category: 'color_vision_deficiency',
        text: 'Do you have difficulty distinguishing between red and green?',
        subCategory: 'protanopia',
        type: 'radio',
        options: [
          { value: 'no', label: 'No difficulty', score: 0 },
          { value: 'slight', label: 'Slight difficulty', score: 2 },
          { value: 'significant', label: 'Significant difficulty', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'cv_2',
        category: 'color_vision_deficiency',
        text: 'Do you have difficulty distinguishing between blue and yellow?',
        subCategory: 'tritanopia',
        type: 'radio',
        options: [
          { value: 'no', label: 'No difficulty', score: 0 },
          { value: 'slight', label: 'Slight difficulty', score: 2 },
          { value: 'significant', label: 'Significant difficulty', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'cv_3',
        category: 'color_vision_deficiency',
        text: 'Have you been diagnosed with color blindness?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'unsure', label: 'Not sure', score: 1 },
          { value: 'red_green', label: 'Yes - Red-Green (Protanopia/Deuteranopia)', score: 4 },
          { value: 'blue_yellow', label: 'Yes - Blue-Yellow (Tritanopia)', score: 4 },
        ],
        weight: 3,
      },
    ],
  },

  {
    id: 'hearing',
    title: 'Hearing',
    description: 'Questions about your hearing abilities',
    icon: '👂',
    targetDisabilities: ['hearing_impairment'],
    questions: [
      {
        id: 'hi_1',
        category: 'hearing_impairment',
        text: 'How would you describe your hearing ability?',
        type: 'radio',
        options: [
          { value: 'excellent', label: 'Excellent', score: 0 },
          { value: 'good', label: 'Good', score: 1 },
          { value: 'moderate', label: 'Moderate difficulty', score: 2 },
          { value: 'significant', label: 'Significant difficulty', score: 3 },
          { value: 'deaf', label: 'Deaf / profound hearing loss', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'hi_2',
        category: 'hearing_impairment',
        text: 'Do you use hearing aids or cochlear implants?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'sometimes', label: 'Sometimes', score: 2 },
          { value: 'always', label: 'Always', score: 3 },
        ],
        weight: 2,
      },
      {
        id: 'hi_3',
        category: 'hearing_impairment',
        text: 'Do you rely on captions or subtitles when watching videos?',
        type: 'radio',
        options: [
          { value: 'never', label: 'Never', score: 0 },
          { value: 'prefer', label: 'Prefer but not required', score: 1 },
          { value: 'usually', label: 'Usually need them', score: 3 },
          { value: 'always', label: 'Always require them', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'hi_4',
        category: 'hearing_impairment',
        text: 'Do you use sign language as a primary communication method?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'some', label: 'Some sign language', score: 2 },
          { value: 'primary', label: 'Yes, it\'s my primary method', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'hi_5',
        category: 'hearing_impairment',
        text: 'Do you have difficulty hearing in noisy environments?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No difficulty', score: 0 },
          { value: 'some', label: 'Some difficulty', score: 1 },
          { value: 'significant', label: 'Significant difficulty', score: 3 },
          { value: 'unable', label: 'Unable to hear', score: 4 },
        ],
        weight: 2,
      },
    ],
  },

  {
    id: 'physical_motor',
    title: 'Physical & Motor',
    description: 'Questions about physical abilities and mobility',
    icon: '🦾',
    targetDisabilities: ['physical_disability'],
    questions: [
      {
        id: 'pm_1',
        category: 'physical_disability',
        text: 'Do you have difficulty using a standard mouse?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No difficulty', score: 0 },
          { value: 'some', label: 'Some difficulty', score: 2 },
          { value: 'significant', label: 'Significant difficulty', score: 3 },
          { value: 'unable', label: 'Unable to use', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'pm_2',
        category: 'physical_disability',
        text: 'Do you have difficulty using a standard keyboard?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No difficulty', score: 0 },
          { value: 'some', label: 'Some difficulty', score: 2 },
          { value: 'significant', label: 'Significant difficulty', score: 3 },
          { value: 'unable', label: 'Unable to use', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'pm_3',
        category: 'physical_disability',
        text: 'Do you use any assistive input devices?',
        type: 'checkbox',
        options: [
          { value: 'none', label: 'None', score: 0 },
          { value: 'voice', label: 'Voice control / speech recognition', score: 2 },
          { value: 'switch', label: 'Switch device', score: 3 },
          { value: 'eye', label: 'Eye tracking', score: 3 },
          { value: 'head', label: 'Head pointer', score: 3 },
          { value: 'specialized', label: 'Specialized keyboard/mouse', score: 2 },
        ],
        weight: 3,
      },
      {
        id: 'pm_4',
        category: 'physical_disability',
        text: 'Do you have limited hand/arm mobility or limb differences?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'one_hand', label: 'Limited use of one hand/arm', score: 3 },
          { value: 'both_limited', label: 'Limited use of both hands/arms', score: 4 },
          { value: 'no_arms', label: 'No arm/hand use', score: 4 },
        ],
        weight: 3,
      },
      {
        id: 'pm_5',
        category: 'physical_disability',
        text: 'Do you experience tremors or difficulty with fine motor control?',
        type: 'radio',
        options: [
          { value: 'no', label: 'No', score: 0 },
          { value: 'mild', label: 'Mild', score: 1 },
          { value: 'moderate', label: 'Moderate', score: 2 },
          { value: 'severe', label: 'Severe', score: 3 },
        ],
        weight: 2,
      },
    ],
  },
];


const DISABILITY_THRESHOLDS: Record<DisabilityType, { min: number; mildMax: number; moderateMax: number }> = {
  dyslexia: { min: 8, mildMax: 12, moderateMax: 18 },
  dysgraphia: { min: 6, mildMax: 10, moderateMax: 15 },
  dyscalculia: { min: 8, mildMax: 12, moderateMax: 18 },
  adhd: { min: 10, mildMax: 15, moderateMax: 22 },
  asd: { min: 10, mildMax: 15, moderateMax: 22 },
  intellectual_disability: { min: 8, mildMax: 12, moderateMax: 18 },
  sld: { min: 6, mildMax: 10, moderateMax: 15 },
  visual_impairment: { min: 6, mildMax: 10, moderateMax: 16 },
  hearing_impairment: { min: 6, mildMax: 10, moderateMax: 16 },
  physical_disability: { min: 6, mildMax: 10, moderateMax: 16 },
  color_vision_deficiency: { min: 4, mildMax: 6, moderateMax: 10 },
};

export function calculateDisabilityScores(responses: AssessmentResponse[]): Map<DisabilityType, number> {
  const scores = new Map<DisabilityType, number>();

  const allDisabilities: DisabilityType[] = [
    'dyslexia', 'dysgraphia', 'dyscalculia', 'adhd', 'asd',
    'intellectual_disability', 'sld', 'visual_impairment',
    'hearing_impairment', 'physical_disability', 'color_vision_deficiency',
  ];
  allDisabilities.forEach(d => scores.set(d, 0));

  const allQuestions = ASSESSMENT_SECTIONS.flatMap(s => s.questions);

  responses.forEach(response => {
    const question = allQuestions.find(q => q.id === response.questionId);
    if (question) {
      const currentScore = scores.get(question.category) || 0;
      const weightedScore = response.score * question.weight;
      scores.set(question.category, currentScore + weightedScore);
    }
  });

  return scores;
}

export function inferDisabilities(responses: AssessmentResponse[]): InferredDisability[] {
  const scores = calculateDisabilityScores(responses);
  const inferred: InferredDisability[] = [];

  scores.forEach((score, disability) => {
    const thresholds = DISABILITY_THRESHOLDS[disability];

    if (score >= thresholds.min) {
      let severity: SeverityLevel;
      let confidence: number;

      if (score <= thresholds.mildMax) {
        severity = 'mild';
        confidence = Math.min(70, 50 + (score - thresholds.min) * 5);
      } else if (score <= thresholds.moderateMax) {
        severity = 'moderate';
        confidence = Math.min(85, 70 + (score - thresholds.mildMax) * 2);
      } else {
        severity = 'severe';
        confidence = Math.min(95, 85 + Math.min(10, (score - thresholds.moderateMax)));
      }

      let subType: ColorVisionType | undefined;
      if (disability === 'color_vision_deficiency') {
        subType = determineColorVisionType(responses);
      }

      inferred.push({
        type: disability,
        confidence,
        severity,
        subType,
      });
    }
  });

  return inferred.sort((a, b) => b.confidence - a.confidence);
}

function determineColorVisionType(responses: AssessmentResponse[]): ColorVisionType {
  const redGreenQ = responses.find(r => r.questionId === 'cv_1');
  const blueYellowQ = responses.find(r => r.questionId === 'cv_2');
  const diagnosedQ = responses.find(r => r.questionId === 'cv_3');

  if (diagnosedQ) {
    if (diagnosedQ.value === 'red_green') return 'deuteranopia';
    if (diagnosedQ.value === 'blue_yellow') return 'tritanopia';
  }

  const redGreenScore = redGreenQ?.score || 0;
  const blueYellowScore = blueYellowQ?.score || 0;

  if (redGreenScore > blueYellowScore && redGreenScore >= 2) {
    return 'deuteranopia';
  }
  if (blueYellowScore > redGreenScore && blueYellowScore >= 2) {
    return 'tritanopia';
  }

  return 'none';
}


export function generateAdaptationProfile(disabilities: InferredDisability[]): AdaptationProfile {
  const profile: AdaptationProfile = {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 100,
    lineHeight: 1.5,
    letterSpacing: 0,
    wordSpacing: 0,
    textColor: '#1a1a1a',
    backgroundColor: '#ffffff',
    highContrast: false,
    colorFilter: 'none',
    reducedAnimations: false,
    focusMode: false,
    simplifiedUI: false,
    chunkContent: false,
    breakReminders: false,
    breakIntervalMinutes: 25,
    readingGuide: false,
    readingRuler: false,
    textToSpeech: false,
    largeClickTargets: false,
    keyboardNavigation: false,
    voiceInput: false,
    extendedTimeouts: false,
    visualAlerts: false,
    captionsEnabled: false,
    signLanguageSupport: false,
    predictableLayout: false,
    reducedSensoryInput: false,
    clearNavigationCues: false,
  };

  disabilities.forEach(disability => {
    const intensity = disability.severity === 'severe' ? 1.5 :
                     disability.severity === 'moderate' ? 1.2 : 1;

    switch (disability.type) {
      case 'dyslexia':
        profile.fontFamily = '"OpenDyslexic", "Comic Sans MS", sans-serif';
        profile.fontSize = Math.max(profile.fontSize, 110 * intensity);
        profile.lineHeight = Math.max(profile.lineHeight, 1.8);
        profile.letterSpacing = Math.max(profile.letterSpacing, 0.05);
        profile.wordSpacing = Math.max(profile.wordSpacing, 0.1);
        profile.backgroundColor = '#fdf6e3';
        profile.readingGuide = true;
        profile.readingRuler = true;
        profile.textToSpeech = disability.severity !== 'mild';
        break;

      case 'dysgraphia':
        profile.voiceInput = true;
        profile.extendedTimeouts = true;
        profile.largeClickTargets = true;
        break;

      case 'dyscalculia':
        profile.fontSize = Math.max(profile.fontSize, 105);
        profile.chunkContent = true;
        profile.simplifiedUI = true;
        break;

      case 'adhd':
        profile.reducedAnimations = true;
        profile.focusMode = true;
        profile.simplifiedUI = true;
        profile.chunkContent = true;
        profile.breakReminders = true;
        profile.breakIntervalMinutes = disability.severity === 'severe' ? 15 :
                                       disability.severity === 'moderate' ? 20 : 25;
        profile.reducedSensoryInput = true;
        break;

      case 'asd':
        profile.predictableLayout = true;
        profile.reducedAnimations = true;
        profile.reducedSensoryInput = true;
        profile.simplifiedUI = true;
        profile.clearNavigationCues = true;
        profile.backgroundColor = '#f8f8f8';
        profile.textColor = '#333333';
        break;

      case 'intellectual_disability':
        profile.fontSize = Math.max(profile.fontSize, 115 * intensity);
        profile.simplifiedUI = true;
        profile.chunkContent = true;
        profile.clearNavigationCues = true;
        profile.extendedTimeouts = true;
        profile.textToSpeech = true;
        profile.lineHeight = Math.max(profile.lineHeight, 1.8);
        break;

      case 'sld':
        profile.fontSize = Math.max(profile.fontSize, 105);
        profile.chunkContent = true;
        profile.textToSpeech = disability.severity !== 'mild';
        profile.extendedTimeouts = true;
        break;

      case 'visual_impairment':
        profile.fontSize = Math.max(profile.fontSize, 120 * intensity);
        profile.highContrast = true;
        profile.textToSpeech = true;
        profile.largeClickTargets = true;
        profile.keyboardNavigation = true;
        profile.clearNavigationCues = true;
        profile.textColor = '#000000';
        profile.backgroundColor = '#ffffff';
        if (disability.severity === 'severe') {
          profile.fontSize = Math.max(profile.fontSize, 150);
        }
        break;

      case 'hearing_impairment':
        profile.visualAlerts = true;
        profile.captionsEnabled = true;
        profile.signLanguageSupport = disability.severity !== 'mild';
        break;

      case 'physical_disability':
        profile.largeClickTargets = true;
        profile.keyboardNavigation = true;
        profile.voiceInput = true;
        profile.extendedTimeouts = true;
        break;

      case 'color_vision_deficiency':
        if (disability.subType && disability.subType !== 'none') {
          profile.colorFilter = disability.subType;
        }
        profile.highContrast = true;
        break;
    }
  });

  return profile;
}


export function getDisabilityLabel(type: DisabilityType): string {
  const labels: Record<DisabilityType, string> = {
    dyslexia: 'Dyslexia',
    dysgraphia: 'Dysgraphia',
    dyscalculia: 'Dyscalculia',
    adhd: 'ADHD',
    asd: 'Autism Spectrum',
    intellectual_disability: 'Intellectual Disability',
    sld: 'Specific Learning Disorder',
    visual_impairment: 'Visual Impairment',
    hearing_impairment: 'Hearing Impairment',
    physical_disability: 'Physical/Motor Disability',
    color_vision_deficiency: 'Color Vision Deficiency',
  };
  return labels[type];
}

export function getDisabilityDescription(type: DisabilityType): string {
  const descriptions: Record<DisabilityType, string> = {
    dyslexia: 'Affects reading fluency and comprehension',
    dysgraphia: 'Affects writing abilities and fine motor skills',
    dyscalculia: 'Affects understanding of numbers and math',
    adhd: 'Affects attention, focus, and impulse control',
    asd: 'Affects social interaction and sensory processing',
    intellectual_disability: 'Affects learning speed and cognitive processing',
    sld: 'Affects specific academic skills',
    visual_impairment: 'Affects vision and visual processing',
    hearing_impairment: 'Affects hearing and audio processing',
    physical_disability: 'Affects physical movement and motor control',
    color_vision_deficiency: 'Affects color perception',
  };
  return descriptions[type];
}

export function getTotalQuestionCount(): number {
  return ASSESSMENT_SECTIONS.reduce((total, section) => total + section.questions.length, 0);
}
