'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Volume2, Brain, Hand, AlertCircle, Check } from 'lucide-react';

/**
 * Course Accessibility Tagger
 * Allows teachers to tag courses with disability compatibility, sensory load, and interaction types
 */

interface AccessibilityTag {
  disability_type: string;
  compatibility_level: number;
  has_captions: boolean;
  has_transcripts: boolean;
  has_audio_description: boolean;
  has_sign_language: boolean;
  has_simplified_version: boolean;
  has_extended_time: boolean;
  sensory_load: 'low' | 'medium' | 'high';
  primary_interaction_type: 'visual' | 'auditory' | 'kinesthetic' | 'text_based' | 'mixed';
  requires_sustained_attention: boolean;
  allows_self_pacing: boolean;
  estimated_cognitive_load: number;
}

interface SensoryProfile {
  visual_complexity: number;
  color_count?: number;
  has_animations: boolean;
  animation_speed?: 'slow' | 'medium' | 'fast';
  has_flashing: boolean;
  auditory_complexity: number;
  has_background_music: boolean;
  has_sound_effects: boolean;
  text_density: number;
  concept_complexity: number;
  requires_precise_clicking: boolean;
  requires_typing: boolean;
  has_time_limits: boolean;
}

interface CourseAccessibilityTaggerProps {
  courseId: string;
  contentId?: string;
  onSave?: (tags: AccessibilityTag[], sensoryProfile?: SensoryProfile) => void;
  initialTags?: AccessibilityTag[];
  initialSensoryProfile?: SensoryProfile;
}

const DISABILITY_TYPES = [
  { value: 'dyslexia', label: 'Dyslexia', icon: '📖' },
  { value: 'dysgraphia', label: 'Dysgraphia', icon: '✍️' },
  { value: 'dyscalculia', label: 'Dyscalculia', icon: '🔢' },
  { value: 'adhd', label: 'ADHD', icon: '🎯' },
  { value: 'asd', label: 'Autism Spectrum', icon: '🧩' },
  { value: 'visual_impairment', label: 'Visual Impairment', icon: '👁️' },
  { value: 'hearing_impairment', label: 'Hearing Impairment', icon: '👂' },
  { value: 'physical_disability', label: 'Physical Disability', icon: '♿' },
  { value: 'intellectual_disability', label: 'Intellectual Disability', icon: '🧠' },
];

export default function CourseAccessibilityTagger({
  courseId,
  contentId,
  onSave,
  initialTags = [],
  initialSensoryProfile,
}: CourseAccessibilityTaggerProps) {
  const [selectedDisability, setSelectedDisability] = useState<string>(DISABILITY_TYPES[0].value);
  const [tags, setTags] = useState<Record<string, AccessibilityTag>>(
    initialTags.reduce((acc, tag) => ({ ...acc, [tag.disability_type]: tag }), {})
  );

  const [sensoryProfile, setSensoryProfile] = useState<SensoryProfile>(
    initialSensoryProfile || {
      visual_complexity: 3,
      has_animations: false,
      has_flashing: false,
      auditory_complexity: 3,
      has_background_music: false,
      has_sound_effects: false,
      text_density: 3,
      concept_complexity: 3,
      requires_precise_clicking: false,
      requires_typing: false,
      has_time_limits: false,
    }
  );

  const currentTag = tags[selectedDisability] || {
    disability_type: selectedDisability,
    compatibility_level: 3,
    has_captions: false,
    has_transcripts: false,
    has_audio_description: false,
    has_sign_language: false,
    has_simplified_version: false,
    has_extended_time: false,
    sensory_load: 'medium' as const,
    primary_interaction_type: 'mixed' as const,
    requires_sustained_attention: false,
    allows_self_pacing: true,
    estimated_cognitive_load: 3,
  };

  const updateTag = (updates: Partial<AccessibilityTag>) => {
    setTags({
      ...tags,
      [selectedDisability]: { ...currentTag, ...updates },
    });
  };

  const updateSensoryProfile = (updates: Partial<SensoryProfile>) => {
    setSensoryProfile({ ...sensoryProfile, ...updates });
  };

  const handleSave = () => {
    const tagArray = Object.values(tags);
    onSave?.(tagArray, sensoryProfile);
  };

  return (
    <div className="space-y-6">
      {}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Accessibility & Sensory Tagging</h2>
        <p className="text-gray-600 mt-1">
          Configure how this content works for students with different needs
        </p>
      </div>

      <Tabs defaultValue="disability" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="disability">Disability Tags</TabsTrigger>
          <TabsTrigger value="sensory">Sensory Profile</TabsTrigger>
          <TabsTrigger value="interaction">Interaction</TabsTrigger>
        </TabsList>

        {}
        <TabsContent value="disability" className="space-y-6">
          {}
          <Card>
            <CardHeader>
              <CardTitle>Select Disability Type</CardTitle>
              <CardDescription>
                Configure compatibility for each disability type separately
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {DISABILITY_TYPES.map((type) => (
                  <Badge
                    key={type.value}
                    variant={selectedDisability === type.value ? 'default' : 'outline'}
                    className="cursor-pointer py-2 px-4 text-sm"
                    onClick={() => setSelectedDisability(type.value)}
                  >
                    <span className="mr-2">{type.icon}</span>
                    {type.label}
                    {tags[type.value] && (
                      <Check size={14} className="ml-2 text-green-600" />
                    )}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {}
          <Card>
            <CardHeader>
              <CardTitle>Compatibility Level for {DISABILITY_TYPES.find(d => d.value === selectedDisability)?.label}</CardTitle>
              <CardDescription>
                How well does this content work for students with this disability?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Compatibility Rating</Label>
                  <span className="text-sm font-medium">
                    {currentTag.compatibility_level}/5
                  </span>
                </div>
                <Slider
                  value={[currentTag.compatibility_level]}
                  onValueChange={([value]) => updateTag({ compatibility_level: value })}
                  min={1}
                  max={5}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>Not Compatible</span>
                  <span>Partially</span>
                  <span>Fully Compatible</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {}
          <Card>
            <CardHeader>
              <CardTitle>Available Accommodations</CardTitle>
              <CardDescription>
                What accessibility features are provided?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="captions" className="cursor-pointer">Captions/Subtitles</Label>
                  <Switch
                    id="captions"
                    checked={currentTag.has_captions}
                    onCheckedChange={(checked) => updateTag({ has_captions: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="transcripts" className="cursor-pointer">Text Transcripts</Label>
                  <Switch
                    id="transcripts"
                    checked={currentTag.has_transcripts}
                    onCheckedChange={(checked) => updateTag({ has_transcripts: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="audio-desc" className="cursor-pointer">Audio Description</Label>
                  <Switch
                    id="audio-desc"
                    checked={currentTag.has_audio_description}
                    onCheckedChange={(checked) => updateTag({ has_audio_description: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="sign-lang" className="cursor-pointer">Sign Language</Label>
                  <Switch
                    id="sign-lang"
                    checked={currentTag.has_sign_language}
                    onCheckedChange={(checked) => updateTag({ has_sign_language: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="simplified" className="cursor-pointer">Simplified Version</Label>
                  <Switch
                    id="simplified"
                    checked={currentTag.has_simplified_version}
                    onCheckedChange={(checked) => updateTag({ has_simplified_version: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="extended-time" className="cursor-pointer">Extended Time Available</Label>
                  <Switch
                    id="extended-time"
                    checked={currentTag.has_extended_time}
                    onCheckedChange={(checked) => updateTag({ has_extended_time: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {}
        <TabsContent value="sensory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <Eye className="inline mr-2" size={20} />
                Visual Complexity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Visual Complexity Level</Label>
                  <span className="text-sm font-medium">{sensoryProfile.visual_complexity}/5</span>
                </div>
                <Slider
                  value={[sensoryProfile.visual_complexity]}
                  onValueChange={([value]) => updateSensoryProfile({ visual_complexity: value })}
                  min={1}
                  max={5}
                  step={1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  1 = Minimal visuals, 5 = Rich multimedia
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="animations">Contains Animations</Label>
                <Switch
                  id="animations"
                  checked={sensoryProfile.has_animations}
                  onCheckedChange={(checked) => updateSensoryProfile({ has_animations: checked })}
                />
              </div>

              {sensoryProfile.has_animations && (
                <div>
                  <Label>Animation Speed</Label>
                  <Select
                    value={sensoryProfile.animation_speed || 'medium'}
                    onValueChange={(value) => updateSensoryProfile({ animation_speed: value as 'slow' | 'medium' | 'fast' })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slow">Slow</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="fast">Fast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="text-red-600" size={20} />
                  <Label htmlFor="flashing" className="text-red-900">Contains Flashing Content</Label>
                </div>
                <Switch
                  id="flashing"
                  checked={sensoryProfile.has_flashing}
                  onCheckedChange={(checked) => updateSensoryProfile({ has_flashing: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Volume2 className="inline mr-2" size={20} />
                Auditory Complexity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Auditory Complexity Level</Label>
                  <span className="text-sm font-medium">{sensoryProfile.auditory_complexity}/5</span>
                </div>
                <Slider
                  value={[sensoryProfile.auditory_complexity]}
                  onValueChange={([value]) => updateSensoryProfile({ auditory_complexity: value })}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="bg-music">Background Music</Label>
                <Switch
                  id="bg-music"
                  checked={sensoryProfile.has_background_music}
                  onCheckedChange={(checked) => updateSensoryProfile({ has_background_music: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sound-fx">Sound Effects</Label>
                <Switch
                  id="sound-fx"
                  checked={sensoryProfile.has_sound_effects}
                  onCheckedChange={(checked) => updateSensoryProfile({ has_sound_effects: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Brain className="inline mr-2" size={20} />
                Cognitive Load
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Text Density</Label>
                  <span className="text-sm font-medium">{sensoryProfile.text_density}/5</span>
                </div>
                <Slider
                  value={[sensoryProfile.text_density]}
                  onValueChange={([value]) => updateSensoryProfile({ text_density: value })}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <Label>Concept Complexity</Label>
                  <span className="text-sm font-medium">{sensoryProfile.concept_complexity}/5</span>
                </div>
                <Slider
                  value={[sensoryProfile.concept_complexity]}
                  onValueChange={([value]) => updateSensoryProfile({ concept_complexity: value })}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {}
        <TabsContent value="interaction" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Interaction Type</CardTitle>
              <CardDescription>How do students interact with this content?</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={currentTag.primary_interaction_type}
                onValueChange={(value) => updateTag({ primary_interaction_type: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visual">Visual (Reading, Watching)</SelectItem>
                  <SelectItem value="auditory">Auditory (Listening)</SelectItem>
                  <SelectItem value="kinesthetic">Kinesthetic (Hands-on Activity)</SelectItem>
                  <SelectItem value="text_based">Text-Based (Reading & Writing)</SelectItem>
                  <SelectItem value="mixed">Mixed (Multiple Modalities)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning Pace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Requires Sustained Attention</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Content requires continuous focus without breaks
                  </p>
                </div>
                <Switch
                  checked={currentTag.requires_sustained_attention}
                  onCheckedChange={(checked) => updateTag({ requires_sustained_attention: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Allows Self-Pacing</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Students can control the speed of content
                  </p>
                </div>
                <Switch
                  checked={currentTag.allows_self_pacing}
                  onCheckedChange={(checked) => updateTag({ allows_self_pacing: checked })}
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <Label>Estimated Cognitive Load</Label>
                  <span className="text-sm font-medium">{currentTag.estimated_cognitive_load}/5</span>
                </div>
                <Slider
                  value={[currentTag.estimated_cognitive_load]}
                  onValueChange={([value]) => updateTag({ estimated_cognitive_load: value })}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Hand className="inline mr-2" size={20} />
                Motor Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="precise-click">Requires Precise Clicking</Label>
                <Switch
                  id="precise-click"
                  checked={sensoryProfile.requires_precise_clicking}
                  onCheckedChange={(checked) => updateSensoryProfile({ requires_precise_clicking: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="typing">Requires Typing</Label>
                <Switch
                  id="typing"
                  checked={sensoryProfile.requires_typing}
                  onCheckedChange={(checked) => updateSensoryProfile({ requires_typing: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div>
                  <Label htmlFor="time-limits" className="text-amber-900">Has Time Limits</Label>
                  <p className="text-xs text-amber-700 mt-1">
                    Content must be completed within a specific time
                  </p>
                </div>
                <Switch
                  id="time-limits"
                  checked={sensoryProfile.has_time_limits}
                  onCheckedChange={(checked) => updateSensoryProfile({ has_time_limits: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sensory Load Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={currentTag.sensory_load}
                onValueChange={(value) => updateTag({ sensory_load: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (Minimal stimuli, calm environment)</SelectItem>
                  <SelectItem value="medium">Medium (Balanced, moderate stimulation)</SelectItem>
                  <SelectItem value="high">High (Rich multimedia, high engagement)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {}
      <div className="flex justify-end gap-4 pt-6 border-t">
        <Button variant="outline">Cancel</Button>
        <Button onClick={handleSave}>
          <Check size={16} className="mr-2" />
          Save Accessibility Tags
        </Button>
      </div>

      {}
      <Card className="bg-terracotta-50 border-2 border-terracotta-200">
        <CardContent className="p-4">
          <h4 className="font-medium text-espresso mb-2">Tagging Summary</h4>
          <div className="text-sm text-espresso/75 space-y-1">
            <p>✓ {Object.keys(tags).length} disability types configured</p>
            <p>✓ Sensory profile: {sensoryProfile.visual_complexity}/5 visual, {sensoryProfile.auditory_complexity}/5 auditory</p>
            <p>✓ Interaction type: {currentTag.primary_interaction_type}</p>
            <p>✓ Sensory load: {currentTag.sensory_load}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
