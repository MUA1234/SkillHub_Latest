'use client';

import React, { useState, useEffect } from 'react';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ColorBlindMode, FontFamily } from '@/lib/accessibility-types';

const AccessibilityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
    <circle cx="12" cy="4" r="2" />
    <path d="M12 6v6m0 0l4 4m-4-4l-4 4" />
    <path d="M6 10h12" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const BrainIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M12 2a4 4 0 0 0-4 4v1H6a4 4 0 0 0 0 8h2v1a4 4 0 0 0 8 0v-1h2a4 4 0 0 0 0-8h-2V6a4 4 0 0 0-4-4z" />
  </svg>
);

const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12" />
  </svg>
);

const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'system', label: 'System Default' },
  { value: 'opendyslexic', label: 'OpenDyslexic' },
  { value: 'atkinson_hyperlegible', label: 'Atkinson Hyperlegible' },
  { value: 'comic_sans', label: 'Comic Sans' },
  { value: 'arial', label: 'Arial' },
  { value: 'verdana', label: 'Verdana' },
];

const COLOR_BLIND_OPTIONS: { value: ColorBlindMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'protanopia', label: 'Protanopia (Red-Blind)' },
  { value: 'deuteranopia', label: 'Deuteranopia (Green-Blind)' },
  { value: 'tritanopia', label: 'Tritanopia (Blue-Blind)' },
  { value: 'achromatopsia', label: 'Achromatopsia (Grayscale)' },
];

interface QuickToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}

const QuickToggle: React.FC<QuickToggleProps> = ({
  label,
  description,
  checked,
  onCheckedChange,
  icon,
}) => (
  <div
    className={`flex items-center justify-between p-3 rounded-xl border-2 transition-colors cursor-pointer ${
      checked ? 'bg-terracotta-50 border-terracotta/30' : 'border-transparent hover:bg-cream-100'
    }`}
    onClick={() => onCheckedChange(!checked)}
  >
    <div className="flex items-center gap-3">
      {icon && <span className="text-espresso/65">{icon}</span>}
      <div>
        <div className="font-medium text-sm text-espresso">{label}</div>
        {description && <div className="text-xs text-espresso/55">{description}</div>}
      </div>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

export const AccessibilityQuickPanel: React.FC = () => {
  const {
    preferences,
    updatePreferences,
    resetPreferences,
    toggleHighContrast,
    toggleReducedMotion,
    toggleFocusMode,
    toggleTextToSpeech,
    toggleReadingGuide,
    setColorBlindMode,
    setFontSize,
    setFontFamily,
  } = useAccessibility();

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-sticker-sm bg-cream-50 hover:bg-cream-100 border-2 border-espresso text-espresso"
          style={{ zIndex: 99998 }}
          aria-label="Open accessibility settings (Alt + A)"
        >
          <AccessibilityIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-h-[80vh] overflow-y-auto bg-cream-50 border-2 border-espresso/15 shadow-kid-lg rounded-2xl p-4"
        style={{ backgroundColor: '#FDFAF3', zIndex: 99999 }}
        side="top"
        align="end"
        sideOffset={16}
      >
        <div className="space-y-4">
          {}
          <div className="flex items-center justify-between border-b-2 border-espresso/10 pb-3">
            <h3 className="font-semibold text-lg text-espresso">Accessibility Settings</h3>
            <Button variant="ghost" size="sm" onClick={resetPreferences} className="text-espresso/65 hover:text-espresso hover:bg-cream-100">
              Reset All
            </Button>
          </div>

          {}
          <Tabs defaultValue="visual" className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto">
              <TabsTrigger value="visual" className="flex flex-col py-2 gap-1">
                <EyeIcon />
                <span className="text-xs">Visual</span>
              </TabsTrigger>
              <TabsTrigger value="audio" className="flex flex-col py-2 gap-1">
                <VolumeIcon />
                <span className="text-xs">Audio</span>
              </TabsTrigger>
              <TabsTrigger value="cognitive" className="flex flex-col py-2 gap-1">
                <BrainIcon />
                <span className="text-xs">Cognitive</span>
              </TabsTrigger>
              <TabsTrigger value="input" className="flex flex-col py-2 gap-1">
                <KeyboardIcon />
                <span className="text-xs">Input</span>
              </TabsTrigger>
            </TabsList>

            {}
            <TabsContent value="visual" className="space-y-4 mt-4">
              {}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm text-espresso">Font Size</Label>
                  <span className="text-sm text-espresso/55">{preferences.font_size}%</span>
                </div>
                <Slider
                  value={[preferences.font_size]}
                  onValueChange={([value]) => setFontSize(value)}
                  min={50}
                  max={200}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-espresso/40">
                  <span>50%</span>
                  <span>200%</span>
                </div>
              </div>

              {}
              <div className="space-y-2">
                <Label className="text-sm">Font Style</Label>
                <Select
                  value={preferences.font_family}
                  onValueChange={(value) => setFontFamily(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {}
              <div className="space-y-2">
                <Label className="text-sm">Color Vision</Label>
                <Select
                  value={preferences.color_blind_mode}
                  onValueChange={(value) => setColorBlindMode(value as ColorBlindMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_BLIND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {}
              <div className="space-y-1">
                <QuickToggle
                  label="High Contrast"
                  description="Enhance visual contrast"
                  checked={preferences.high_contrast}
                  onCheckedChange={toggleHighContrast}
                />
                <QuickToggle
                  label="Invert Colors"
                  description="Dark mode alternative"
                  checked={preferences.invert_colors}
                  onCheckedChange={(checked) => updatePreferences({ invert_colors: checked })}
                />
                <QuickToggle
                  label="Large Click Targets"
                  description="Make buttons bigger"
                  checked={preferences.large_click_targets}
                  onCheckedChange={(checked) => updatePreferences({ large_click_targets: checked })}
                />
              </div>
            </TabsContent>

            {}
            <TabsContent value="audio" className="space-y-4 mt-4">
              <QuickToggle
                label="Text-to-Speech"
                description="Read content aloud"
                checked={preferences.text_to_speech}
                onCheckedChange={toggleTextToSpeech}
              />
              <QuickToggle
                label="Audio Descriptions"
                description="Describe visual content"
                checked={preferences.audio_descriptions}
                onCheckedChange={(checked) => updatePreferences({ audio_descriptions: checked })}
              />
              <QuickToggle
                label="Auto Captions"
                description="Show video captions"
                checked={preferences.auto_captions}
                onCheckedChange={(checked) => updatePreferences({ auto_captions: checked })}
              />
              <QuickToggle
                label="Sign Language Videos"
                description="Show sign language overlay"
                checked={preferences.sign_language_videos}
                onCheckedChange={(checked) => updatePreferences({ sign_language_videos: checked })}
              />

              {preferences.text_to_speech && (
                <div className="space-y-2 pl-4 border-l-2 border-terracotta/40">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-sm text-espresso">Speech Speed</Label>
                      <span className="text-sm text-espresso/55">{preferences.tts_speed}x</span>
                    </div>
                    <Slider
                      value={[preferences.tts_speed]}
                      onValueChange={([value]) => updatePreferences({ tts_speed: value })}
                      min={0.5}
                      max={2}
                      step={0.1}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            {}
            <TabsContent value="cognitive" className="space-y-4 mt-4">
              <QuickToggle
                label="Focus Mode"
                description="Minimize distractions"
                checked={preferences.focus_mode}
                onCheckedChange={toggleFocusMode}
              />
              <QuickToggle
                label="Reduced Motion"
                description="Less animation"
                checked={preferences.reduced_motion}
                onCheckedChange={toggleReducedMotion}
              />
              <QuickToggle
                label="Reading Guide"
                description="Highlight lines"
                checked={preferences.reading_guide}
                onCheckedChange={toggleReadingGuide}
              />
              <QuickToggle
                label="Simplified UI"
                description="Cleaner interface"
                checked={preferences.simplified_ui}
                onCheckedChange={(checked) => updatePreferences({ simplified_ui: checked })}
              />
              <QuickToggle
                label="Break Reminders"
                description="Regular break alerts"
                checked={preferences.break_reminders}
                onCheckedChange={(checked) => updatePreferences({ break_reminders: checked })}
              />
              <QuickToggle
                label="Step-by-Step Mode"
                description="Guided learning"
                checked={preferences.step_by_step_mode}
                onCheckedChange={(checked) => updatePreferences({ step_by_step_mode: checked })}
              />
              {}
              <QuickToggle
                label="Low-bandwidth mode"
                description="Save data on slow connections"
                checked={!!preferences.low_bandwidth_mode}
                onCheckedChange={(checked) => updatePreferences({ low_bandwidth_mode: checked })}
              />

              {preferences.break_reminders && (
                <div className="space-y-2 pl-4 border-l-2 border-terracotta/40">
                  <div className="flex justify-between">
                    <Label className="text-sm text-espresso">Break Interval</Label>
                    <span className="text-sm text-espresso/55">{preferences.break_interval_minutes} min</span>
                  </div>
                  <Slider
                    value={[preferences.break_interval_minutes]}
                    onValueChange={([value]) => updatePreferences({ break_interval_minutes: value })}
                    min={10}
                    max={60}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}
            </TabsContent>

            {}
            <TabsContent value="input" className="space-y-4 mt-4">
              <QuickToggle
                label="Keyboard Navigation"
                description="Navigate with keyboard"
                checked={preferences.keyboard_navigation}
                onCheckedChange={(checked) => updatePreferences({ keyboard_navigation: checked })}
              />
              <QuickToggle
                label="Voice Input"
                description="Speech-to-text"
                checked={preferences.voice_input}
                onCheckedChange={(checked) => updatePreferences({ voice_input: checked })}
              />
              <QuickToggle
                label="Extended Time"
                description="More time for tasks"
                checked={preferences.extended_time_default}
                onCheckedChange={(checked) => updatePreferences({ extended_time_default: checked })}
              />
              <QuickToggle
                label="Word Prediction"
                description="Suggest words while typing"
                checked={preferences.word_prediction}
                onCheckedChange={(checked) => updatePreferences({ word_prediction: checked })}
              />
              <QuickToggle
                label="Spell Check Enhanced"
                description="Better spelling suggestions"
                checked={preferences.spell_check_enhanced}
                onCheckedChange={(checked) => updatePreferences({ spell_check_enhanced: checked })}
              />
            </TabsContent>
          </Tabs>

          {}
          <div className="border-t-2 border-espresso/10 pt-3 text-xs text-espresso/55 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-cream-200 border border-espresso/15 rounded text-espresso">Alt</kbd> +{' '}
            <kbd className="px-1.5 py-0.5 bg-cream-200 border border-espresso/15 rounded text-espresso">A</kbd> to toggle this panel
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AccessibilityQuickPanel;
