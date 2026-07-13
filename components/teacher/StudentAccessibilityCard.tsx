'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Ear,
  Brain,
  BookOpen,
  Calculator,
  Pencil,
  Focus,
  Palette,
  Hand,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle,
} from 'lucide-react';
import { DisabilityType, SeverityLevel, getDisabilityLabel } from '@/lib/disability-assessment';

interface StudentAccessibilityInfo {
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  disabilities: {
    type: DisabilityType;
    severity: SeverityLevel;
    confidence: number;
  }[];
  accommodationNotes?: string;
  preferredLearningStyles?: string[];
  shareLevel: 'full' | 'basic' | 'minimal';
}

interface StudentAccessibilityCardProps {
  student: StudentAccessibilityInfo;
  compact?: boolean;
}

const disabilityIcons: Record<DisabilityType, React.ElementType> = {
  dyslexia: BookOpen,
  dysgraphia: Pencil,
  dyscalculia: Calculator,
  adhd: Focus,
  asd: Brain,
  intellectual_disability: Lightbulb,
  sld: BookOpen,
  visual_impairment: Eye,
  hearing_impairment: Ear,
  physical_disability: Hand,
  color_vision_deficiency: Palette,
};

const severityColors: Record<SeverityLevel, string> = {
  mild: 'bg-green-100 text-green-700 border-green-200',
  moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  severe: 'bg-red-100 text-red-700 border-red-200',
};

const teachingTips: Record<DisabilityType, string[]> = {
  dyslexia: [
    'Use dyslexia-friendly fonts in materials',
    'Provide audio alternatives to text',
    'Allow extra time for reading tasks',
    'Use colored overlays or backgrounds',
  ],
  dysgraphia: [
    'Accept typed submissions instead of handwritten',
    'Provide note templates and graphic organizers',
    'Allow voice recording for responses',
    'Focus on content over handwriting quality',
  ],
  dyscalculia: [
    'Use visual representations of math concepts',
    'Allow use of calculators and number lines',
    'Break problems into smaller steps',
    'Provide real-world context for numbers',
  ],
  adhd: [
    'Break lessons into shorter segments',
    'Provide frequent breaks',
    'Use varied activities to maintain engagement',
    'Minimize distractions in learning materials',
  ],
  asd: [
    'Maintain consistent routines and structure',
    'Give clear, literal instructions',
    'Provide advance notice of changes',
    'Offer quiet spaces for overwhelm',
  ],
  intellectual_disability: [
    'Use simple, clear language',
    'Break tasks into small steps',
    'Provide extra practice and repetition',
    'Use visual aids and hands-on activities',
  ],
  sld: [
    'Identify specific areas of difficulty',
    'Provide multi-sensory learning options',
    'Allow alternative assessment methods',
    'Build on student strengths',
  ],
  visual_impairment: [
    'Ensure all content is screen-reader compatible',
    'Describe visual elements verbally',
    'Provide large print or audio materials',
    'Use high contrast in visual materials',
  ],
  hearing_impairment: [
    'Provide written instructions and captions',
    'Face the student when speaking',
    'Use visual cues and demonstrations',
    'Check for understanding frequently',
  ],
  physical_disability: [
    'Ensure digital materials are keyboard accessible',
    'Allow flexible deadlines when needed',
    'Provide alternative input methods',
    'Consider fatigue in scheduling',
  ],
  color_vision_deficiency: [
    'Don\'t rely on color alone to convey information',
    'Use patterns in addition to colors',
    'Label color-coded elements',
    'Test materials with color blindness simulators',
  ],
};

export function StudentAccessibilityCard({ student, compact = false }: StudentAccessibilityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTips, setShowTips] = useState<DisabilityType | null>(null);

  if (student.disabilities.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid overflow-hidden"
    >
      {}
      <div
        className={`p-4 flex items-center justify-between ${compact ? '' : 'cursor-pointer'}`}
        onClick={() => !compact && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {}
          <div className="w-10 h-10 rounded-full bg-terracotta border-2 border-espresso flex items-center justify-center text-cream font-semibold shadow-sticker-sm">
            {student.studentName.charAt(0).toUpperCase()}
          </div>

          {}
          <div>
            <h3 className="font-medium text-espresso">{student.studentName}</h3>
            <div className="flex flex-wrap gap-1 mt-1">
              {student.disabilities.slice(0, compact ? 2 : 3).map((d, i) => {
                const Icon = disabilityIcons[d.type];
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[d.severity]}`}
                  >
                    <Icon size={12} />
                    {getDisabilityLabel(d.type)}
                  </span>
                );
              })}
              {student.disabilities.length > (compact ? 2 : 3) && (
                <span className="text-xs text-espresso/55">
                  +{student.disabilities.length - (compact ? 2 : 3)} more
                </span>
              )}
            </div>
          </div>
        </div>

        {!compact && (
          <button className="p-2 hover:bg-cream-200 rounded-full transition-colors text-espresso">
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        )}
      </div>

      {}
      <AnimatePresence>
        {(expanded || !compact) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t-2 border-espresso/10 pt-4">
              {}
              <div>
                <h4 className="text-sm font-medium text-espresso mb-2">Accessibility Needs</h4>
                <div className="space-y-2">
                  {student.disabilities.map((d, i) => {
                    const Icon = disabilityIcons[d.type];
                    return (
                      <div key={i} className="bg-cream-100 border-2 border-espresso/10 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon size={18} className="text-espresso/65" />
                            <span className="font-medium text-espresso">
                              {getDisabilityLabel(d.type)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[d.severity]}`}
                            >
                              {d.severity}
                            </span>
                          </div>
                          <button
                            onClick={() => setShowTips(showTips === d.type ? null : d.type)}
                            className="text-terracotta-500 hover:text-terracotta-700 text-sm flex items-center gap-1 font-semibold"
                          >
                            <Lightbulb size={14} />
                            Tips
                          </button>
                        </div>

                        {}
                        <AnimatePresence>
                          {showTips === d.type && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-3 pt-3 border-t border-espresso/10"
                            >
                              <h5 className="text-sm font-medium text-espresso mb-2">
                                Teaching Recommendations
                              </h5>
                              <ul className="space-y-1">
                                {teachingTips[d.type].map((tip, ti) => (
                                  <li
                                    key={ti}
                                    className="flex items-start gap-2 text-sm text-espresso/70"
                                  >
                                    <CheckCircle size={14} className="text-forest-300 mt-0.5 flex-shrink-0" />
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              {}
              {student.preferredLearningStyles && student.preferredLearningStyles.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-espresso mb-2">
                    Preferred Learning Styles
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {student.preferredLearningStyles.map((style, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-terracotta-50 border border-terracotta-200 text-espresso rounded-full text-sm font-semibold"
                      >
                        {style}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {}
              {student.accommodationNotes && student.shareLevel === 'full' && (
                <div>
                  <h4 className="text-sm font-medium text-espresso mb-2">
                    Additional Notes
                  </h4>
                  <p className="text-sm text-espresso/75 bg-mustard-50 p-3 rounded-xl border-2 border-mustard-200">
                    {student.accommodationNotes}
                  </p>
                </div>
              )}

              {}
              <div className="flex items-start gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  This student has shared {student.shareLevel} accessibility information with you.
                  Please use this information respectfully to support their learning.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default StudentAccessibilityCard;
