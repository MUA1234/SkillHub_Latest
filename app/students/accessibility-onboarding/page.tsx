'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2 } from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';


const DISABILITY_CATEGORIES = [
  {
    id: 'learning',
    name: 'Learning Differences',
    icon: '📚',
    description: 'Dyslexia, dyscalculia, and other learning challenges',
    types: [
      { id: 'dyslexia', name: 'Dyslexia', hint: 'Difficulty with reading' },
      { id: 'dysgraphia', name: 'Dysgraphia', hint: 'Difficulty with writing' },
      { id: 'dyscalculia', name: 'Dyscalculia', hint: 'Difficulty with math' },
      { id: 'sld', name: 'Other Learning Disorder', hint: 'General learning challenges' },
    ],
  },
  {
    id: 'attention',
    name: 'Attention & Focus',
    icon: '🎯',
    description: 'ADHD, autism, and related conditions',
    types: [
      { id: 'adhd', name: 'ADHD', hint: 'Attention and focus challenges' },
      { id: 'asd', name: 'Autism Spectrum', hint: 'Communication and sensory differences' },
    ],
  },
  {
    id: 'vision',
    name: 'Vision',
    icon: '👁️',
    description: 'Visual impairments and color blindness',
    types: [
      { id: 'visual_impairment_low_vision', name: 'Low Vision', hint: 'Partial vision loss' },
      { id: 'visual_impairment_blind', name: 'Blind/Severe Vision Loss', hint: 'Little to no vision' },
      { id: 'color_vision_protanopia', name: 'Red-Green Color Blind', hint: 'Protanopia/Deuteranopia' },
      { id: 'color_vision_tritanopia', name: 'Blue-Yellow Color Blind', hint: 'Tritanopia' },
    ],
  },
  {
    id: 'hearing',
    name: 'Hearing',
    icon: '👂',
    description: 'Hearing impairments',
    types: [
      { id: 'hearing_impairment_hard_of_hearing', name: 'Hard of Hearing', hint: 'Partial hearing loss' },
      { id: 'hearing_impairment_deaf', name: 'Deaf', hint: 'Profound hearing loss' },
    ],
  },
  {
    id: 'motor',
    name: 'Motor & Physical',
    icon: '🖐️',
    description: 'Physical and mobility challenges',
    types: [
      { id: 'physical_disability_mobility', name: 'Mobility Impairment', hint: 'Movement challenges' },
      { id: 'physical_disability_no_limbs', name: 'Limb Difference', hint: 'Missing or different limbs' },
    ],
  },
];


export default function AccessibilityOnboarding() {
  const router = useRouter();
  const { completeOnboarding, updatePreferences } = useAccessibility();

  const [hasDisability, setHasDisability] = useState<boolean | null>(null);
  const [selectedDisabilities, setSelectedDisabilities] = useState<string[]>([]);
  const [severityLevels, setSeverityLevels] = useState<Record<string, 'mild' | 'moderate' | 'severe'>>({});
  const [additionalNeeds, setAdditionalNeeds] = useState('');
  const [shareWithTeachers, setShareWithTeachers] = useState(true);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [professionallyDiagnosed, setProfessionallyDiagnosed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const toggleDisability = (disabilityId: string) => {
    setSelectedDisabilities((prev) => {
      if (prev.includes(disabilityId)) {
        const newSelection = prev.filter((d) => d !== disabilityId);
        const { [disabilityId]: _, ...rest } = severityLevels;
        setSeverityLevels(rest);
        return newSelection;
      } else {
        setSeverityLevels((s) => ({ ...s, [disabilityId]: 'moderate' }));
        return [...prev, disabilityId];
      }
    });
  };

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      if (hasDisability && selectedDisabilities.length === 0) {
        setError('Please select at least one disability type');
        setIsSubmitting(false);
        return;
      }

      const profileData = {
        has_disability: hasDisability || false,
        disability_types: selectedDisabilities,
        primary_disability: selectedDisabilities[0] || null,
        severity_levels: severityLevels,
        professionally_diagnosed: professionallyDiagnosed,
        additional_needs: additionalNeeds,
        share_with_teachers: shareWithTeachers,
        guardian_email: guardianEmail || null,
        onboarding_completed: true,
      };

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/disability-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save profile');
      }

      if (hasDisability && selectedDisabilities.length > 0) {
        await applyAccessibilityPresets(selectedDisabilities[0]);
      }

      if (completeOnboarding) {
        completeOnboarding();
      }

      setSuccess(true);

      setTimeout(() => {
        router.push('/students/dashboard');
      }, 2000);

    } catch (err: any) {
      console.error('Onboarding error:', err);
      setError(err.message || 'Failed to save your profile. Please try again.');
      setIsSubmitting(false);
    }
  };

  const applyAccessibilityPresets = async (disabilityType: string) => {
    try {
      const token = localStorage.getItem('token');
      
      const presetResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/presets?disability_type=${disabilityType}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (presetResponse.ok) {
        const presets = await presetResponse.json();
        if (presets.length > 0) {
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/presets/${presets[0].id}/apply`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
            }
          );
        }
      }
    } catch (err) {
      console.error('Failed to apply presets:', err);
    }
  };

  const handleSkipOnboarding = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/disability-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            has_disability: false,
            disability_types: [],
            onboarding_completed: true,
          }),
        });
      }

      if (completeOnboarding) {
        completeOnboarding();
      }
      router.push('/students/dashboard');
    } catch (err) {
      console.error('Skip error:', err);
      router.push('/students/dashboard');
    }
  };

  const hasSelections = selectedDisabilities.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream-100 to-cream-50">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-2xl mx-auto">
        {}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-terracotta/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">♿</span>
          </div>
          <h1 className="text-2xl font-bold text-espresso mb-2">
            Personalize Your Learning Experience
          </h1>
          <p className="text-espresso/70 max-w-md mx-auto">
            Help us understand your needs so we can provide the best learning experience for you. This takes less than 2 minutes.
          </p>
        </div>

        {}
        {success && (
          <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-forest/30 rounded-2xl shadow-lg animate-slide-down">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-forest animate-bounce" />
              </div>
              <div>
                <p className="font-semibold text-green-900">Success!</p>
                <p className="text-sm text-forest-500">Profile saved successfully! Redirecting to your personalized dashboard...</p>
              </div>
            </div>
          </div>
        )}

        {}
        {error && (
          <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-rose-50 border-2 border-coral/30 rounded-2xl shadow-lg animate-slide-down">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-red-900">Error</p>
                <p className="text-sm text-coral">{error}</p>
              </div>
            </div>
          </div>
        )}

        {}
        {hasDisability === null && (
          <div className="card-gradient mb-8 animate-scale-in">
            <div className="p-6 border-b border-blue-100">
              <h2 className="text-2xl font-bold text-espresso mb-2">Do you have any disabilities or learning differences?</h2>
              <p className="text-espresso/70">
                This helps us personalize your experience. Your information is private and secure. 🔒
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setHasDisability(true)}
                  className="h-32 flex flex-col items-center justify-center gap-3 bg-cream-50 border-2 border-terracotta/30 rounded-2xl font-semibold hover:bg-terracotta/10 hover:border-blue-400 hover:shadow-lg transform hover:-translate-y-1 transition-all duration-200 focus:ring-4 focus:ring-blue-300"
                >
                  <span className="text-4xl">✓</span>
                  <span className="text-lg">Yes, I do</span>
                </button>
                <button
                  onClick={() => setHasDisability(false)}
                  className="h-32 flex flex-col items-center justify-center gap-3 bg-cream-50 border-2 border-espresso/15 rounded-2xl font-semibold hover:bg-cream-100 hover:border-espresso/40 hover:shadow-lg transform hover:-translate-y-1 transition-all duration-200 focus:ring-4 focus:ring-espresso/20"
                >
                  <span className="text-4xl">✗</span>
                  <span className="text-lg">No, I don&apos;t</span>
                </button>
              </div>
              <div className="text-center pt-2">
                <button 
                  onClick={handleSkipOnboarding}
                  className="text-espresso/55 hover:text-espresso text-sm font-medium hover:underline transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        )}

        {}
        {hasDisability === false && (
          <div className="card-elevated mb-8 animate-scale-in">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-forest/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg text-espresso mb-6">
                Great! You can always update this later in your settings if anything changes.
              </p>
              <button 
                onClick={handleSubmit} 
                disabled={isSubmitting}
                className="btn-success"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Continue to Dashboard →'
                )}
              </button>
            </div>
          </div>
        )}

        {}
        {hasDisability === true && (
          <>
            <div className="space-y-4 mb-6">
              {DISABILITY_CATEGORIES.map((category) => (
                <Card key={category.id} className="overflow-hidden">
                  <CardHeader className="pb-3 bg-cream-100">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{category.icon}</span>
                      <div>
                        <CardTitle className="text-base">{category.name}</CardTitle>
                        <CardDescription className="text-sm">{category.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {category.types.map((type) => {
                        const isSelected = selectedDisabilities.includes(type.id);
                        return (
                          <div
                            key={type.id}
                            onClick={() => toggleDisability(type.id)}
                            className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              isSelected
                                ? 'border-terracotta bg-terracotta/10'
                                : 'border-espresso/15 hover:border-espresso/20'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <Checkbox
                                checked={isSelected}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{type.name}</div>
                                <div className="text-xs text-espresso/55">{type.hint}</div>

                                {}
                                {isSelected && (
                                  <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    {(['mild', 'moderate', 'severe'] as const).map((level) => (
                                      <button
                                        key={level}
                                        onClick={() => setSeverityLevels(s => ({ ...s, [type.id]: level }))}
                                        className={`px-2 py-0.5 text-xs rounded ${
                                          severityLevels[type.id] === level
                                            ? 'bg-terracotta text-white'
                                            : 'bg-cream-100 text-espresso/70 hover:bg-cream-300'
                                        }`}
                                      >
                                        {level}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {}
            {hasSelections && (
              <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-forest/30 rounded-2xl shadow-lg animate-slide-down">
                <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2 text-lg">
                  <span className="text-2xl">✨</span> We&apos;ll automatically apply these features:
                </h3>
                  <ul className="text-sm text-forest-500 space-y-1">
                    {selectedDisabilities.includes('dyslexia') && (
                      <li>• Dyslexia-friendly font, increased spacing, cream background</li>
                    )}
                    {selectedDisabilities.includes('adhd') && (
                      <li>• Focus mode, reduced animations, break reminders</li>
                    )}
                    {selectedDisabilities.includes('asd') && (
                      <li>• Simplified interface, predictable layout</li>
                    )}
                    {(selectedDisabilities.includes('visual_impairment_low_vision') ||
                      selectedDisabilities.includes('visual_impairment_blind')) && (
                      <li>• Large text, high contrast, text-to-speech</li>
                    )}
                    {(selectedDisabilities.includes('hearing_impairment_hard_of_hearing') ||
                      selectedDisabilities.includes('hearing_impairment_deaf')) && (
                      <li>• Auto-captions, visual notifications</li>
                    )}
                    {(selectedDisabilities.includes('color_vision_protanopia') ||
                      selectedDisabilities.includes('color_vision_tritanopia')) && (
                      <li>• Color blindness filters</li>
                    )}
                    {(selectedDisabilities.includes('physical_disability_mobility') ||
                      selectedDisabilities.includes('physical_disability_no_limbs')) && (
                      <li>• Large click targets, keyboard navigation</li>
                    )}
                  </ul>
              </div>
            )}

            {}
            <div className="card-elevated mb-6">
              <div className="p-5 border-b border-espresso/10">
                <h3 className="text-lg font-semibold text-espresso">Additional Information (Optional)</h3>
                <p className="text-sm text-espresso/70 mt-1">Help us serve you better</p>
              </div>
              <div className="p-5 space-y-4">
                {}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="diagnosed"
                    checked={professionallyDiagnosed}
                    onCheckedChange={(checked) => setProfessionallyDiagnosed(checked as boolean)}
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor="diagnosed" className="font-medium text-sm">
                      Professionally diagnosed
                    </Label>
                    <p className="text-xs text-espresso/55">
                      I have been formally diagnosed by a healthcare professional
                    </p>
                  </div>
                </div>

                {}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="share-teachers"
                    checked={shareWithTeachers}
                    onCheckedChange={(checked) => setShareWithTeachers(checked as boolean)}
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor="share-teachers" className="font-medium text-sm">
                      Share with my teachers
                    </Label>
                    <p className="text-xs text-espresso/55">
                      Teachers can provide better accommodations when they know your needs
                    </p>
                  </div>
                </div>

                {}
                <div>
                  <Label htmlFor="guardian-email" className="text-sm font-medium">
                    Parent/Guardian email (optional)
                  </Label>
                  <Input
                    id="guardian-email"
                    type="email"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="mt-1"
                  />
                  <p className="text-xs text-espresso/55 mt-1">
                    They&apos;ll receive progress reports and can help manage settings
                  </p>
                </div>

                {}
                <div>
                  <Label htmlFor="additional" className="text-sm font-medium">
                    Anything else we should know? (optional)
                  </Label>
                  <Textarea
                    id="additional"
                    value={additionalNeeds}
                    onChange={(e) => setAdditionalNeeds(e.target.value)}
                    placeholder="Any specific accommodations or preferences..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !hasSelections}
                className="flex-1 btn-primary py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <span>Save & Continue to Dashboard</span>
                    <span className="ml-2">→</span>
                  </>
                )}
              </button>
              <button
                onClick={handleSkipOnboarding}
                className="sm:w-auto btn-secondary py-4"
                disabled={isSubmitting}
              >
                Skip for now
              </button>
            </div>

            {}
            <p className="text-xs text-center text-espresso/45 mt-6">
              🔒 Your information is private and encrypted. You can change these settings anytime in your profile.
            </p>
          </>
        )}
      </div>
        </div>
      </main>
    </div>
  );
}
