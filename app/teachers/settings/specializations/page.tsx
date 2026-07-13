'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
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
  Award,
  Clock,
  Users,
  Save,
  CheckCircle,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { DisabilityType, getDisabilityLabel, getDisabilityDescription } from '@/lib/disability-assessment';

interface TeacherSpecialization {
  disabilityType: DisabilityType;
  level: 'none' | 'basic' | 'intermediate' | 'advanced' | 'expert';
  certified: boolean;
  certificationName?: string;
  yearsExperience: number;
  comfortLevel: number;
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

const allDisabilities: DisabilityType[] = [
  'dyslexia',
  'dysgraphia',
  'dyscalculia',
  'adhd',
  'asd',
  'intellectual_disability',
  'sld',
  'visual_impairment',
  'hearing_impairment',
  'physical_disability',
  'color_vision_deficiency',
];

const levelColors: Record<string, string> = {
  none: 'bg-cream-100 text-espresso/55',
  basic: 'bg-terracotta/15 text-terracotta-500',
  intermediate: 'bg-forest/15 text-forest-500',
  advanced: 'bg-coral/15 text-coral',
  expert: 'bg-mustard/20 text-mustard-500',
};

export default function TeacherSpecializationsPage() {
  const [specializations, setSpecializations] = useState<TeacherSpecialization[]>(
    allDisabilities.map((type) => ({
      disabilityType: type,
      level: 'none',
      certified: false,
      yearsExperience: 0,
      comfortLevel: 3,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateSpecialization = (
    type: DisabilityType,
    updates: Partial<TeacherSpecialization>
  ) => {
    setSpecializations((prev) =>
      prev.map((s) => (s.disabilityType === type ? { ...s, ...updates } : s))
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
  };

  const activeSpecializations = specializations.filter((s) => s.level !== 'none');

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole="teacher"
        userName="Teacher"
        userEmail="teacher@example.com"
      />
      <DashboardSidebar userRole="teacher" />

      <div className="pt-20 pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-espresso mb-2">
            Disability Specializations
          </h1>
          <p className="text-espresso/70">
            Indicate your expertise in teaching students with different accessibility needs.
            This helps match you with students who can benefit from your experience.
          </p>
        </div>

        {}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-cream-50 p-4 rounded-xl border border-espresso/15">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-terracotta/15 rounded-lg">
                <Award className="w-5 h-5 text-terracotta" />
              </div>
              <div>
                <p className="text-2xl font-bold text-espresso">
                  {activeSpecializations.length}
                </p>
                <p className="text-sm text-espresso/55">Specializations</p>
              </div>
            </div>
          </div>
          <div className="bg-cream-50 p-4 rounded-xl border border-espresso/15">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-forest/15 rounded-lg">
                <CheckCircle className="w-5 h-5 text-forest" />
              </div>
              <div>
                <p className="text-2xl font-bold text-espresso">
                  {specializations.filter((s) => s.certified).length}
                </p>
                <p className="text-sm text-espresso/55">Certifications</p>
              </div>
            </div>
          </div>
          <div className="bg-cream-50 p-4 rounded-xl border border-espresso/15">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-coral/15 rounded-lg">
                <Users className="w-5 h-5 text-coral" />
              </div>
              <div>
                <p className="text-2xl font-bold text-espresso">
                  {specializations.filter((s) => s.level === 'expert').length}
                </p>
                <p className="text-sm text-espresso/55">Expert Areas</p>
              </div>
            </div>
          </div>
        </div>

        {}
        <div className="space-y-4 mb-8">
          {specializations.map((spec) => {
            const Icon = disabilityIcons[spec.disabilityType];
            return (
              <motion.div
                key={spec.disabilityType}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-cream-50 rounded-xl border transition-all ${
                  spec.level !== 'none' ? 'border-terracotta/30 shadow-sm' : 'border-espresso/15'
                }`}
              >
                <div className="p-4">
                  {}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          spec.level !== 'none' ? 'bg-terracotta/15' : 'bg-cream-100'
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 ${
                            spec.level !== 'none' ? 'text-terracotta' : 'text-espresso/45'
                          }`}
                        />
                      </div>
                      <div>
                        <h3 className="font-medium text-espresso">
                          {getDisabilityLabel(spec.disabilityType)}
                        </h3>
                        <p className="text-sm text-espresso/55">
                          {getDisabilityDescription(spec.disabilityType)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                        levelColors[spec.level]
                      }`}
                    >
                      {spec.level === 'none' ? 'Not specified' : spec.level}
                    </span>
                  </div>

                  {}
                  <div className="grid grid-cols-2 gap-4">
                    {}
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Experience Level
                      </label>
                      <select
                        value={spec.level}
                        onChange={(e) =>
                          updateSpecialization(spec.disabilityType, {
                            level: e.target.value as TeacherSpecialization['level'],
                          })
                        }
                        className="w-full p-2 border border-espresso/15 rounded-lg focus:ring-2 focus:ring-terracotta"
                      >
                        <option value="none">None / Not applicable</option>
                        <option value="basic">Basic - Some awareness</option>
                        <option value="intermediate">Intermediate - Practical experience</option>
                        <option value="advanced">Advanced - Extensive experience</option>
                        <option value="expert">Expert - Specialized training</option>
                      </select>
                    </div>

                    {}
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Years of Experience
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={spec.yearsExperience}
                          onChange={(e) =>
                            updateSpecialization(spec.disabilityType, {
                              yearsExperience: Number(e.target.value),
                            })
                          }
                          disabled={spec.level === 'none'}
                          className="w-full p-2 border border-espresso/15 rounded-lg focus:ring-2 focus:ring-terracotta disabled:bg-cream-100 disabled:text-espresso/45"
                        />
                        <Clock className="w-5 h-5 text-espresso/45" />
                      </div>
                    </div>

                    {}
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Comfort Level (1-5)
                      </label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            onClick={() =>
                              updateSpecialization(spec.disabilityType, {
                                comfortLevel: level,
                              })
                            }
                            disabled={spec.level === 'none'}
                            className={`w-10 h-10 rounded-lg font-medium transition-all ${
                              spec.comfortLevel === level
                                ? 'bg-terracotta text-white'
                                : 'bg-cream-100 text-espresso/70 hover:bg-cream-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>

                    {}
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Certification
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateSpecialization(spec.disabilityType, {
                              certified: !spec.certified,
                            })
                          }
                          disabled={spec.level === 'none'}
                          className={`relative w-12 h-6 rounded-full transition-colors ${
                            spec.certified ? 'bg-green-500' : 'bg-cream-300'
                          } disabled:opacity-50`}
                        >
                          <motion.div
                            className="absolute top-1 left-1 w-4 h-4 bg-cream-50 rounded-full"
                            animate={{ x: spec.certified ? 24 : 0 }}
                          />
                        </button>
                        <span className="text-sm text-espresso/70">
                          {spec.certified ? 'Certified' : 'Not certified'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {}
                  {spec.certified && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4"
                    >
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Certification Name
                      </label>
                      <input
                        type="text"
                        value={spec.certificationName || ''}
                        onChange={(e) =>
                          updateSpecialization(spec.disabilityType, {
                            certificationName: e.target.value,
                          })
                        }
                        placeholder="e.g., Wilson Reading System Certified"
                        className="w-full p-2 border border-espresso/15 rounded-lg focus:ring-2 focus:ring-terracotta"
                      />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {}
        <div className="sticky bottom-6 flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving || saved}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium shadow-lg transition-colors ${
              saved
                ? 'bg-forest text-white'
                : 'bg-terracotta text-white hover:bg-terracotta-500'
            } disabled:opacity-70`}
          >
            {saving ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Save size={20} />
                </motion.div>
                Saving...
              </>
            ) : saved ? (
              <>
                <CheckCircle size={20} />
                Saved
              </>
            ) : (
              <>
                <Save size={20} />
                Save Specializations
              </>
            )}
          </motion.button>
        </div>
        </div>
      </div>
    </div>
  );
}
