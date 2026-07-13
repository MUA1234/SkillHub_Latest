'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ASSESSMENT_SECTIONS,
  AssessmentSection,
  AssessmentQuestion,
  AssessmentResponse,
  AssessmentResult,
  InferredDisability,
  AdaptationProfile,
  inferDisabilities,
  generateAdaptationProfile,
  getDisabilityLabel,
  getTotalQuestionCount,
} from '@/lib/disability-assessment';

interface DisabilityAssessmentFormProps {
  onComplete: (result: AssessmentResult) => void;
  onSkip?: () => void;
  assistedBy?: string;
}

export function DisabilityAssessmentForm({
  onComplete,
  onSkip,
  assistedBy = 'self',
}: DisabilityAssessmentFormProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<AssessmentResponse[]>([]);
  const [showIntro, setShowIntro] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [inferredDisabilities, setInferredDisabilities] = useState<InferredDisability[]>([]);
  const [adaptationProfile, setAdaptationProfile] = useState<AdaptationProfile | null>(null);

  const currentSection = ASSESSMENT_SECTIONS[currentSectionIndex];
  const currentQuestion = currentSection?.questions[currentQuestionIndex];
  const totalQuestions = getTotalQuestionCount();

  const questionsAnswered = responses.length;
  const progressPercent = Math.round((questionsAnswered / totalQuestions) * 100);

  const getCurrentResponse = useCallback(() => {
    return responses.find(r => r.questionId === currentQuestion?.id);
  }, [responses, currentQuestion]);

  const handleResponse = useCallback((value: string | number | string[], score: number) => {
    if (!currentQuestion) return;

    setResponses(prev => {
      const existing = prev.findIndex(r => r.questionId === currentQuestion.id);
      const newResponse: AssessmentResponse = {
        questionId: currentQuestion.id,
        value,
        score,
      };

      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newResponse;
        return updated;
      }
      return [...prev, newResponse];
    });
  }, [currentQuestion]);

  const goToNext = useCallback(() => {
    if (!currentSection) return;

    if (currentQuestionIndex < currentSection.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else if (currentSectionIndex < ASSESSMENT_SECTIONS.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
      setCurrentQuestionIndex(0);
    } else {
      const disabilities = inferDisabilities(responses);
      const profile = generateAdaptationProfile(disabilities);
      setInferredDisabilities(disabilities);
      setAdaptationProfile(profile);
      setShowResults(true);
    }
  }, [currentSection, currentQuestionIndex, currentSectionIndex, responses]);

  const goToPrevious = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
      const prevSection = ASSESSMENT_SECTIONS[currentSectionIndex - 1];
      setCurrentQuestionIndex(prevSection.questions.length - 1);
    }
  }, [currentQuestionIndex, currentSectionIndex]);

  const handleComplete = useCallback(() => {
    if (!adaptationProfile) return;

    const result: AssessmentResult = {
      responses,
      inferredDisabilities,
      adaptationProfile,
      completedAt: new Date().toISOString(),
    };

    onComplete(result);
  }, [responses, inferredDisabilities, adaptationProfile, onComplete]);

  if (showIntro) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-cream-50 rounded-3xl shadow-kid-lg border-2 border-espresso/10 p-8"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-terracotta border-2 border-espresso rounded-full flex items-center justify-center mx-auto mb-4 shadow-sticker">
              <span className="text-4xl">🌟</span>
            </div>
            <h1 className="text-2xl font-bold text-espresso mb-2">
              Let&apos;s Personalize Your Experience
            </h1>
            <p className="text-espresso/70">
              We&apos;ll ask a few questions to understand how you learn best.
              This helps us automatically adjust the platform to work perfectly for you.
            </p>
          </div>

          <div className="bg-terracotta-50 border-2 border-terracotta-200 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-espresso mb-3">What to expect:</h3>
            <ul className="space-y-2 text-espresso/80">
              <li className="flex items-start gap-2">
                <span className="text-terracotta-500 mt-1 font-bold">✓</span>
                <span>Simple questions with easy-to-select answers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-terracotta-500 mt-1 font-bold">✓</span>
                <span>Takes about 5-10 minutes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-terracotta-500 mt-1 font-bold">✓</span>
                <span>Your answers are private and secure</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-terracotta-500 mt-1 font-bold">✓</span>
                <span>You can update your preferences anytime</span>
              </li>
            </ul>
          </div>

          <div className="bg-mustard-50 border-2 border-mustard-200 rounded-2xl p-6 mb-8">
            <h3 className="font-semibold text-espresso mb-2">
              Getting help with this form?
            </h3>
            <p className="text-espresso/75 text-sm">
              It&apos;s completely fine to have a parent, guardian, or counselor help you
              answer these questions. They know you well and can help provide accurate information.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setShowIntro(false)}
              className="flex-1 btn-kid-primary py-4 text-base"
            >
              Start Assessment
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="py-4 px-6 text-espresso/65 hover:text-espresso transition-colors font-medium"
              >
                Skip for now
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (showResults) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-cream-50 rounded-3xl shadow-kid-lg border-2 border-espresso/10 p-8"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-forest-300 border-2 border-espresso rounded-full flex items-center justify-center mx-auto mb-4 shadow-sticker">
              <span className="text-4xl">✨</span>
            </div>
            <h1 className="text-2xl font-bold text-espresso mb-2">
              Your Personalized Profile is Ready!
            </h1>
            <p className="text-espresso/70">
              Based on your responses, we&apos;ve created a customized learning experience for you.
            </p>
          </div>

          {inferredDisabilities.length > 0 ? (
            <div className="mb-8">
              <h3 className="font-semibold text-espresso mb-4">
                We&apos;ll optimize your experience for:
              </h3>
              <div className="space-y-3">
                {inferredDisabilities.map((disability, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-cream-100 border-2 border-espresso/10 rounded-xl"
                  >
                    <div>
                      <span className="font-medium text-espresso">
                        {getDisabilityLabel(disability.type)}
                      </span>
                      <span className="ml-2 text-sm text-espresso/55 capitalize">
                        ({disability.severity})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-cream-200 border border-espresso/15 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-terracotta rounded-full"
                          style={{ width: `${disability.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm text-espresso/55">
                        {Math.round(disability.confidence)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-8 p-6 bg-forest-50 border-2 border-forest-200 rounded-2xl">
              <p className="text-forest-500 text-center font-medium">
                Great news! Based on your responses, the standard platform experience
                should work well for you. We&apos;ll still apply some helpful features
                to enhance your learning.
              </p>
            </div>
          )}

          <div className="bg-terracotta-50 border-2 border-terracotta-200 rounded-2xl p-6 mb-8">
            <h3 className="font-semibold text-espresso mb-3">
              What we&apos;ll automatically adjust:
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {adaptationProfile?.textToSpeech && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>🔊</span> Text-to-speech enabled
                </div>
              )}
              {adaptationProfile?.readingGuide && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>📖</span> Reading guide active
                </div>
              )}
              {adaptationProfile?.focusMode && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>🎯</span> Focus mode enabled
                </div>
              )}
              {adaptationProfile?.reducedAnimations && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>✨</span> Reduced animations
                </div>
              )}
              {adaptationProfile?.highContrast && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>🌓</span> High contrast mode
                </div>
              )}
              {adaptationProfile?.captionsEnabled && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>📝</span> Captions enabled
                </div>
              )}
              {adaptationProfile?.largeClickTargets && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>👆</span> Larger click targets
                </div>
              )}
              {adaptationProfile?.keyboardNavigation && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>⌨️</span> Keyboard navigation
                </div>
              )}
              {adaptationProfile?.breakReminders && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>⏰</span> Break reminders
                </div>
              )}
              {adaptationProfile?.simplifiedUI && (
                <div className="flex items-center gap-2 text-espresso/80">
                  <span>🧹</span> Simplified interface
                </div>
              )}
            </div>
          </div>

          <p className="text-sm text-espresso/55 text-center mb-6">
            You can always adjust these settings later in your profile preferences.
          </p>

          <button
            onClick={handleComplete}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-forest-300 px-6 py-4 text-cream font-semibold tracking-tight shadow-sticker-sm border-2 border-espresso hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
          >
            Continue to SkillHub
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-espresso/65">
            Section {currentSectionIndex + 1} of {ASSESSMENT_SECTIONS.length}: {currentSection.title}
          </span>
          <span className="text-sm font-medium text-espresso">
            {progressPercent}% complete
          </span>
        </div>
        <div className="h-2 bg-cream-200 border border-espresso/15 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-terracotta rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">{currentSection.icon}</span>
        <div>
          <h2 className="text-lg font-semibold text-espresso">{currentSection.title}</h2>
          <p className="text-sm text-espresso/55">{currentSection.description}</p>
        </div>
      </div>

      {}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-cream-50 rounded-3xl shadow-kid-lg border-2 border-espresso/10 p-8"
        >
          <QuestionRenderer
            question={currentQuestion}
            response={getCurrentResponse()}
            onResponse={handleResponse}
          />

          {}
          <div className="flex justify-between mt-8 pt-6 border-t-2 border-espresso/10">
            <button
              onClick={goToPrevious}
              disabled={currentSectionIndex === 0 && currentQuestionIndex === 0}
              className="px-6 py-3 text-espresso/65 hover:text-espresso disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              ← Previous
            </button>
            <button
              onClick={goToNext}
              disabled={!getCurrentResponse()}
              className="btn-kid-primary px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
            >
              {currentSectionIndex === ASSESSMENT_SECTIONS.length - 1 &&
               currentQuestionIndex === currentSection.questions.length - 1
                ? 'See Results'
                : 'Next →'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}


interface QuestionRendererProps {
  question: AssessmentQuestion;
  response: AssessmentResponse | undefined;
  onResponse: (value: string | number | string[], score: number) => void;
}

function QuestionRenderer({ question, response, onResponse }: QuestionRendererProps) {
  const [sliderValue, setSliderValue] = useState<number>(
    typeof response?.value === 'number' ? response.value : 5
  );

  switch (question.type) {
    case 'radio':
      return (
        <div>
          <h3 className="text-xl font-medium text-espresso mb-2">{question.text}</h3>
          {question.helpText && (
            <p className="text-sm text-espresso/55 mb-6">{question.helpText}</p>
          )}
          <div className="space-y-3">
            {question.options?.map((option) => (
              <label
                key={String(option.value)}
                className={`flex items-center p-4 rounded-xl cursor-pointer transition-all border-2 ${
                  response?.value === option.value
                    ? 'bg-terracotta-50 border-terracotta-400'
                    : 'bg-cream-100 border-espresso/10 hover:border-espresso/30'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={String(option.value)}
                  checked={response?.value === option.value}
                  onChange={() => onResponse(option.value, option.score)}
                  className="w-5 h-5 accent-terracotta"
                />
                <span className="ml-3 text-espresso">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case 'checkbox':
      const selectedValues = Array.isArray(response?.value) ? response.value : [];
      return (
        <div>
          <h3 className="text-xl font-medium text-espresso mb-2">{question.text}</h3>
          {question.helpText && (
            <p className="text-sm text-espresso/55 mb-6">{question.helpText}</p>
          )}
          <p className="text-sm text-espresso/55 mb-4">Select all that apply</p>
          <div className="space-y-3">
            {question.options?.map((option) => {
              const isSelected = selectedValues.includes(String(option.value));
              return (
                <label
                  key={String(option.value)}
                  className={`flex items-center p-4 rounded-xl cursor-pointer transition-all border-2 ${
                    isSelected
                      ? 'bg-terracotta-50 border-terracotta-400'
                      : 'bg-cream-100 border-espresso/10 hover:border-espresso/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const newValues = isSelected
                        ? selectedValues.filter(v => v !== String(option.value))
                        : [...selectedValues, String(option.value)];
                      const totalScore = question.options
                        ?.filter(o => newValues.includes(String(o.value)))
                        .reduce((sum, o) => sum + o.score, 0) || 0;
                      onResponse(newValues, totalScore);
                    }}
                    className="w-5 h-5 accent-terracotta rounded"
                  />
                  <span className="ml-3 text-espresso">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );

    case 'slider':
      const config = question.sliderConfig!;
      const score = Math.round((sliderValue / config.max) * 4);
      return (
        <div>
          <h3 className="text-xl font-medium text-espresso mb-2">{question.text}</h3>
          {question.helpText && (
            <p className="text-sm text-espresso/55 mb-6">{question.helpText}</p>
          )}
          <div className="mt-8 px-4">
            <input
              type="range"
              min={config.min}
              max={config.max}
              step={config.step}
              value={sliderValue}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSliderValue(val);
                const newScore = Math.round((val / config.max) * 4);
                onResponse(val, newScore);
              }}
              className="w-full h-3 bg-cream-200 border border-espresso/15 rounded-lg appearance-none cursor-pointer slider-thumb accent-terracotta"
            />
            <div className="flex justify-between mt-4">
              {config.labels.map((label) => (
                <span
                  key={label.value}
                  className={`text-sm ${
                    sliderValue === label.value ? 'text-terracotta-500 font-semibold' : 'text-espresso/55'
                  }`}
                >
                  {label.label}
                </span>
              ))}
            </div>
            <div className="text-center mt-4">
              <span className="inline-block px-4 py-2 bg-terracotta border-2 border-espresso text-cream rounded-full font-semibold shadow-sticker-sm">
                {sliderValue}
              </span>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default DisabilityAssessmentForm;
