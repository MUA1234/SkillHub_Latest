'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Type,
  Palette,
  Volume2,
  Brain,
  MousePointer,
  RotateCcw,
  Check,
  Info,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { useAdaptiveAccessibility } from '@/contexts/AdaptiveAccessibilityContext';
import { getDisabilityLabel } from '@/lib/disability-assessment';

export default function AccessibilitySettingsPage() {
  const {
    profile,
    effectiveAdaptations,
    updateOverride,
    resetToAutomatic,
    getDisabilitySummary,
  } = useAdaptiveAccessibility();

  const [activeTab, setActiveTab] = useState<'visual' | 'cognitive' | 'audio' | 'input'>('visual');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const disabilities = getDisabilitySummary();

  const tabs = [
    { id: 'visual', label: 'Visual', icon: Eye },
    { id: 'cognitive', label: 'Cognitive', icon: Brain },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'input', label: 'Input', icon: MousePointer },
  ] as const;

  const handleReset = () => {
    resetToAutomatic();
    setShowResetConfirm(false);
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole="student"
        userName="Student"
        userEmail="student@example.com"
      />
      <DashboardSidebar userRole="student" />

      <div className="pt-20 pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-espresso mb-2">Accessibility Settings</h1>
            <p className="text-espresso/70">
              Fine-tune how the platform adapts to your needs. Changes are saved automatically.
            </p>
          </div>

          {}
          {profile?.hasCompletedAssessment && disabilities.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-6 bg-terracotta-50 rounded-2xl border-2 border-terracotta-200"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-espresso mb-2">Your Accessibility Profile</h2>
                  <p className="text-sm text-espresso/70 mb-3">
                    Based on your selection, we&apos;ve optimized the platform for:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {disabilities.map((disability, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-cream-50 rounded-full text-sm font-medium text-terracotta-500 border border-terracotta/30"
                      >
                        {disability}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-espresso/70 hover:text-espresso hover:bg-cream-50 rounded-lg transition-colors"
                >
                  <RotateCcw size={16} />
                  Reset to Automatic
                </button>
              </div>
            </motion.div>
          )}

          {}
          {!profile?.hasCompletedAssessment && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-6 bg-mustard/15 rounded-2xl border border-amber-100"
            >
              <div className="flex items-start gap-4">
                <Info className="w-6 h-6 text-mustard-500 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="font-semibold text-amber-900 mb-1">
                    No Accessibility Profile Found
                  </h2>
                  <p className="text-sm text-amber-800">
                    You can manually adjust settings below, or choose a support dashboard set up for
                    your needs.
                  </p>
                  <a
                    href="/students/accessibility/choose-track"
                    className="inline-block mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                  >
                    Choose Dashboard
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {}
          <div className="flex gap-2 mb-6 border-b border-espresso/15">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-terracotta border-blue-600'
                    : 'text-espresso/55 border-transparent hover:text-espresso'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>

          {}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {}
            {activeTab === 'visual' && (
              <>
                <SettingCard title="Font Size" description="Adjust the text size across the platform">
                  <SliderSetting
                    value={effectiveAdaptations.fontSize}
                    min={75}
                    max={200}
                    step={5}
                    unit="%"
                    onChange={(value) => updateOverride('fontSize', value)}
                  />
                </SettingCard>

                <SettingCard title="Line Height" description="Adjust spacing between lines of text">
                  <SliderSetting
                    value={effectiveAdaptations.lineHeight}
                    min={1}
                    max={3}
                    step={0.1}
                    onChange={(value) => updateOverride('lineHeight', value)}
                  />
                </SettingCard>

                <SettingCard title="Letter Spacing" description="Adjust spacing between letters">
                  <SliderSetting
                    value={effectiveAdaptations.letterSpacing}
                    min={0}
                    max={0.3}
                    step={0.01}
                    unit="em"
                    onChange={(value) => updateOverride('letterSpacing', value)}
                  />
                </SettingCard>

                <SettingCard title="Font Family" description="Choose a font that works best for you">
                  <select
                    value={effectiveAdaptations.fontFamily}
                    onChange={(e) => updateOverride('fontFamily', e.target.value)}
                    className="w-full p-3 border border-espresso/15 rounded-lg focus:ring-2 focus:ring-terracotta"
                  >
                    <option value="system-ui, -apple-system, sans-serif">System Default</option>
                    <option value='"OpenDyslexic", "Comic Sans MS", sans-serif'>OpenDyslexic (Dyslexia-friendly)</option>
                    <option value='"Atkinson Hyperlegible", sans-serif'>Atkinson Hyperlegible</option>
                    <option value='"Comic Sans MS", cursive'>Comic Sans</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                  </select>
                </SettingCard>

                <SettingCard title="High Contrast" description="Increase contrast for better visibility">
                  <ToggleSetting
                    enabled={effectiveAdaptations.highContrast}
                    onChange={(value) => updateOverride('highContrast', value)}
                  />
                </SettingCard>

                <SettingCard title="Reading Guide" description="Highlight the line you're reading">
                  <ToggleSetting
                    enabled={effectiveAdaptations.readingGuide}
                    onChange={(value) => updateOverride('readingGuide', value)}
                  />
                </SettingCard>

                <SettingCard title="Color Filter" description="Apply color correction for color vision deficiency">
                  <select
                    value={effectiveAdaptations.colorFilter}
                    onChange={(e) => updateOverride('colorFilter', e.target.value as any)}
                    className="w-full p-3 border border-espresso/15 rounded-lg focus:ring-2 focus:ring-terracotta"
                  >
                    <option value="none">None</option>
                    <option value="protanopia">Protanopia (Red-blind)</option>
                    <option value="deuteranopia">Deuteranopia (Green-blind)</option>
                    <option value="tritanopia">Tritanopia (Blue-blind)</option>
                  </select>
                </SettingCard>
              </>
            )}

            {}
            {activeTab === 'cognitive' && (
              <>
                <SettingCard title="Reduced Animations" description="Minimize motion and animations">
                  <ToggleSetting
                    enabled={effectiveAdaptations.reducedAnimations}
                    onChange={(value) => updateOverride('reducedAnimations', value)}
                  />
                </SettingCard>

                <SettingCard title="Focus Mode" description="Reduce distractions and highlight active content">
                  <ToggleSetting
                    enabled={effectiveAdaptations.focusMode}
                    onChange={(value) => updateOverride('focusMode', value)}
                  />
                </SettingCard>

                <SettingCard title="Simplified Interface" description="Show a cleaner, less cluttered interface">
                  <ToggleSetting
                    enabled={effectiveAdaptations.simplifiedUI}
                    onChange={(value) => updateOverride('simplifiedUI', value)}
                  />
                </SettingCard>

                <SettingCard title="Break Reminders" description="Get reminders to take regular breaks">
                  <ToggleSetting
                    enabled={effectiveAdaptations.breakReminders}
                    onChange={(value) => updateOverride('breakReminders', value)}
                  />
                </SettingCard>

                {effectiveAdaptations.breakReminders && (
                  <SettingCard title="Break Interval" description="How often to remind you to take a break">
                    <SliderSetting
                      value={effectiveAdaptations.breakIntervalMinutes}
                      min={10}
                      max={60}
                      step={5}
                      unit=" min"
                      onChange={(value) => updateOverride('breakIntervalMinutes', value)}
                    />
                  </SettingCard>
                )}
              </>
            )}

            {}
            {activeTab === 'audio' && (
              <>
                <SettingCard title="Text-to-Speech" description="Read content aloud when requested">
                  <ToggleSetting
                    enabled={effectiveAdaptations.textToSpeech}
                    onChange={(value) => updateOverride('textToSpeech', value)}
                  />
                </SettingCard>

                <SettingCard title="Visual Alerts" description="Show visual indicators for audio alerts">
                  <ToggleSetting
                    enabled={effectiveAdaptations.visualAlerts}
                    onChange={(value) => updateOverride('visualAlerts', value)}
                  />
                </SettingCard>

                <SettingCard title="Captions" description="Show captions for video content">
                  <ToggleSetting
                    enabled={effectiveAdaptations.captionsEnabled}
                    onChange={(value) => updateOverride('captionsEnabled', value)}
                  />
                </SettingCard>
              </>
            )}

            {}
            {activeTab === 'input' && (
              <>
                <SettingCard title="Large Click Targets" description="Make buttons and links easier to click">
                  <ToggleSetting
                    enabled={effectiveAdaptations.largeClickTargets}
                    onChange={(value) => updateOverride('largeClickTargets', value)}
                  />
                </SettingCard>

                <SettingCard title="Keyboard Navigation" description="Enhanced keyboard shortcuts and focus indicators">
                  <ToggleSetting
                    enabled={effectiveAdaptations.keyboardNavigation}
                    onChange={(value) => updateOverride('keyboardNavigation', value)}
                  />
                </SettingCard>

                <SettingCard title="Voice Input" description="Use voice commands to navigate and input text">
                  <ToggleSetting
                    enabled={effectiveAdaptations.voiceInput}
                    onChange={(value) => updateOverride('voiceInput', value)}
                  />
                </SettingCard>

                <SettingCard title="Extended Timeouts" description="Allow more time for timed interactions">
                  <ToggleSetting
                    enabled={effectiveAdaptations.extendedTimeouts}
                    onChange={(value) => updateOverride('extendedTimeouts', value)}
                  />
                </SettingCard>
              </>
            )}
          </motion.div>

          {}
          {showResetConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-cream-50 rounded-2xl p-6 max-w-md mx-4 shadow-xl"
              >
                <h3 className="text-lg font-semibold text-espresso mb-2">
                  Reset to Automatic Settings?
                </h3>
                <p className="text-espresso/70 mb-6">
                  This will remove all your custom adjustments and restore the settings
                  recommended for your chosen dashboard.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 px-4 py-2 text-espresso bg-cream-100 rounded-lg hover:bg-cream-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 px-4 py-2 text-white bg-terracotta rounded-lg hover:bg-terracotta-500 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 bg-cream-50 rounded-xl border border-espresso/15 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-medium text-espresso">{title}</h3>
          <p className="text-sm text-espresso/55 mt-1">{description}</p>
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    </div>
  );
}

function ToggleSetting({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-14 h-8 rounded-full transition-colors ${
        enabled ? 'bg-terracotta' : 'bg-cream-300'
      }`}
    >
      <motion.div
        className="absolute top-1 left-1 w-6 h-6 bg-cream-50 rounded-full shadow-sm flex items-center justify-center"
        animate={{ x: enabled ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {enabled && <Check size={14} className="text-terracotta" />}
      </motion.div>
    </button>
  );
}

function SliderSetting({
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 min-w-[200px]">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="kid-range flex-1"
      />
      <span className="text-sm font-semibold text-espresso min-w-[60px] text-right">
        {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}
        {unit}
      </span>
    </div>
  );
}
