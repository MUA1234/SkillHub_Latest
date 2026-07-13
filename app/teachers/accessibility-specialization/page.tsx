'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isAuthenticated } from '@/lib/api';

type SpecializationType =
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

type DisabilityType = string;
type ProficiencyLevel = 'none' | 'basic' | 'intermediate' | 'fluent';

interface Certification {
  name: string;
  issuer: string;
  date_obtained: string;
  expiry_date?: string;
}

const SPECIALIZATION_OPTIONS: { value: SpecializationType; label: string; description: string }[] = [
  {
    value: 'general_education',
    label: 'General Education',
    description: 'Teaching neurotypical students with standard curriculum',
  },
  {
    value: 'special_education',
    label: 'Special Education',
    description: 'Broad expertise in teaching students with various disabilities',
  },
  {
    value: 'dyslexia_specialist',
    label: 'Dyslexia Specialist',
    description: 'Specialized in reading disorders and language-based learning differences',
  },
  {
    value: 'adhd_specialist',
    label: 'ADHD Specialist',
    description: 'Expertise in attention and executive function challenges',
  },
  {
    value: 'asd_specialist',
    label: 'Autism Spectrum Specialist',
    description: 'Specialized in autism spectrum disorder education',
  },
  {
    value: 'visual_impairment_specialist',
    label: 'Visual Impairment Specialist',
    description: 'Teaching students with low vision or blindness',
  },
  {
    value: 'hearing_impairment_specialist',
    label: 'Hearing Impairment Specialist',
    description: 'Teaching deaf and hard of hearing students',
  },
  {
    value: 'physical_disability_specialist',
    label: 'Physical Disability Specialist',
    description: 'Adapting education for students with mobility challenges',
  },
  {
    value: 'speech_language_pathologist',
    label: 'Speech-Language Pathologist',
    description: 'Communication disorders and language therapy',
  },
  {
    value: 'inclusive_education',
    label: 'Inclusive Education Expert',
    description: 'Creating inclusive learning environments for all students',
  },
];

const DISABILITY_EXPERIENCE_OPTIONS = [
  { value: 'dyslexia', label: 'Dyslexia' },
  { value: 'dysgraphia', label: 'Dysgraphia' },
  { value: 'dyscalculia', label: 'Dyscalculia' },
  { value: 'adhd', label: 'ADHD' },
  { value: 'asd', label: 'Autism Spectrum Disorder' },
  { value: 'intellectual_disability', label: 'Intellectual Disability' },
  { value: 'visual_impairment', label: 'Visual Impairment' },
  { value: 'hearing_impairment', label: 'Hearing Impairment' },
  { value: 'physical_disability', label: 'Physical Disability' },
  { value: 'speech_language', label: 'Speech/Language Disorders' },
];

const ASSISTIVE_TECH_OPTIONS = [
  'Screen Readers (JAWS, NVDA, VoiceOver)',
  'Text-to-Speech Software',
  'Speech-to-Text Software',
  'Alternative Keyboards',
  'Eye-Tracking Devices',
  'AAC Devices',
  'Braille Displays',
  'Magnification Software',
  'Reading Pens',
  'Math Accessibility Tools',
];

const TEACHING_METHODS = [
  'Multi-sensory Instruction',
  'Universal Design for Learning (UDL)',
  'Differentiated Instruction',
  'Structured Literacy',
  'Visual Learning Strategies',
  'Kinesthetic Learning',
  'Scaffolded Instruction',
  'Task Analysis',
  'Social Stories',
  'Positive Behavior Support',
];

export default function TeacherAccessibilitySpecialization() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [specializations, setSpecializations] = useState<SpecializationType[]>([]);
  const [disabilityExperience, setDisabilityExperience] = useState<DisabilityType[]>([]);
  const [yearsExperience, setYearsExperience] = useState(0);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [newCertification, setNewCertification] = useState<Certification>({
    name: '',
    issuer: '',
    date_obtained: '',
  });
  const [teachingMethods, setTeachingMethods] = useState<string[]>([]);
  const [assistiveTech, setAssistiveTech] = useState<string[]>([]);
  const [signLanguage, setSignLanguage] = useState<ProficiencyLevel>('none');
  const [braille, setBraille] = useState<ProficiencyLevel>('none');
  const [aacExperience, setAacExperience] = useState(false);
  const [acceptsIEP, setAcceptsIEP] = useState(true);
  const [maxSpecialNeeds, setMaxSpecialNeeds] = useState(5);
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    loadExistingData();
  }, [router]);

  const loadExistingData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/teacher-specialization`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.specialization) {
          setSpecializations(data.specialization.specializations || []);
          setDisabilityExperience(data.specialization.disability_experience || []);
          setYearsExperience(data.specialization.years_special_education || 0);
          setCertifications(data.specialization.certifications || []);
          setTeachingMethods(data.specialization.teaching_methods || []);
          setAssistiveTech(data.specialization.assistive_tech_proficiency || []);
          setSignLanguage(data.specialization.sign_language_proficiency || 'none');
          setBraille(data.specialization.braille_proficiency || 'none');
          setAacExperience(data.specialization.aac_experience || false);
          setAcceptsIEP(data.specialization.accepts_iep_students ?? true);
          setMaxSpecialNeeds(data.specialization.max_special_needs_students || 5);
        }
      }
    } catch (error) {
      console.error('Error loading specialization:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/teacher-specialization`,
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          specializations,
          disability_experience: disabilityExperience,
          years_special_education: yearsExperience,
          certifications,
          teaching_methods: teachingMethods,
          assistive_tech_proficiency: assistiveTech,
          sign_language_proficiency: signLanguage,
          braille_proficiency: braille,
          aac_experience: aacExperience,
          accepts_iep_students: acceptsIEP,
          max_special_needs_students: maxSpecialNeeds,
        }),
      });

      if (response.ok) {
        alert('Specialization saved successfully!');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save specialization. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSpecialization = (spec: SpecializationType) => {
    setSpecializations((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const toggleDisability = (disability: string) => {
    setDisabilityExperience((prev) =>
      prev.includes(disability) ? prev.filter((d) => d !== disability) : [...prev, disability]
    );
  };

  const toggleMethod = (method: string) => {
    setTeachingMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const toggleTech = (tech: string) => {
    setAssistiveTech((prev) =>
      prev.includes(tech) ? prev.filter((t) => t !== tech) : [...prev, tech]
    );
  };

  const addCertification = () => {
    if (newCertification.name && newCertification.issuer && newCertification.date_obtained) {
      setCertifications((prev) => [...prev, newCertification]);
      setNewCertification({ name: '', issuer: '', date_obtained: '' });
    }
  };

  const removeCertification = (index: number) => {
    setCertifications((prev) => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="teacher" userName="" userEmail="" />
      <DashboardSidebar userRole="teacher" />
      <main className="pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-4xl mx-auto">
        {}
        <div className="mb-8">
          <PageHeader title="Your accessibility" accent="specialization" />
          <p className="text-espresso/70 mt-2">
            Set up your specializations to help students with disabilities find the right teacher.
          </p>
        </div>

        <Tabs defaultValue="specializations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="specializations">Specializations</TabsTrigger>
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="skills">Skills & Tools</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>

          {}
          <TabsContent value="specializations">
            <Card>
              <CardHeader>
                <CardTitle>Teaching Specializations</CardTitle>
                <CardDescription>
                  Select all areas where you have expertise in teaching students with specific needs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SPECIALIZATION_OPTIONS.map((spec) => (
                    <div
                      key={spec.value}
                      onClick={() => toggleSpecialization(spec.value)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        specializations.includes(spec.value)
                          ? 'border-terracotta bg-terracotta/10'
                          : 'border-espresso/15 hover:border-espresso/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox checked={specializations.includes(spec.value)} className="mt-1" />
                        <div>
                          <h4 className="font-medium">{spec.label}</h4>
                          <p className="text-sm text-espresso/55">{spec.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Disability Experience</CardTitle>
                <CardDescription>
                  Which disabilities have you worked with? Select all that apply.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {DISABILITY_EXPERIENCE_OPTIONS.map((option) => (
                    <Badge
                      key={option.value}
                      variant={disabilityExperience.includes(option.value) ? 'default' : 'outline'}
                      className="cursor-pointer py-2 px-4"
                      onClick={() => toggleDisability(option.value)}
                    >
                      {option.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {}
          <TabsContent value="experience">
            <Card>
              <CardHeader>
                <CardTitle>Years of Experience</CardTitle>
                <CardDescription>
                  How many years have you been teaching students with special needs?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-espresso/55">years in special education</span>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Certifications</CardTitle>
                <CardDescription>
                  Add relevant certifications in special education or accessibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {}
                {certifications.map((cert, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-cream-100 rounded-lg">
                    <div>
                      <div className="font-medium">{cert.name}</div>
                      <div className="text-sm text-espresso/55">
                        {cert.issuer} - {cert.date_obtained}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeCertification(index)}>
                      Remove
                    </Button>
                  </div>
                ))}

                {}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">Add Certification</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Certification Name</Label>
                      <Input
                        value={newCertification.name}
                        onChange={(e) =>
                          setNewCertification((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="e.g., SPED Certification"
                      />
                    </div>
                    <div>
                      <Label>Issuing Organization</Label>
                      <Input
                        value={newCertification.issuer}
                        onChange={(e) =>
                          setNewCertification((prev) => ({ ...prev, issuer: e.target.value }))
                        }
                        placeholder="e.g., State Board"
                      />
                    </div>
                    <div>
                      <Label>Date Obtained</Label>
                      <Input
                        type="date"
                        value={newCertification.date_obtained}
                        onChange={(e) =>
                          setNewCertification((prev) => ({ ...prev, date_obtained: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <Button className="mt-4" onClick={addCertification}>
                    Add Certification
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {}
          <TabsContent value="skills">
            <Card>
              <CardHeader>
                <CardTitle>Teaching Methods</CardTitle>
                <CardDescription>
                  Which teaching methodologies are you trained in?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {TEACHING_METHODS.map((method) => (
                    <div
                      key={method}
                      onClick={() => toggleMethod(method)}
                      className={`p-3 border rounded-lg cursor-pointer text-sm ${
                        teachingMethods.includes(method)
                          ? 'border-terracotta bg-terracotta/10'
                          : 'border-espresso/15 hover:border-espresso/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={teachingMethods.includes(method)} />
                        <span>{method}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Assistive Technology Proficiency</CardTitle>
                <CardDescription>
                  Which assistive technologies are you familiar with?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ASSISTIVE_TECH_OPTIONS.map((tech) => (
                    <div
                      key={tech}
                      onClick={() => toggleTech(tech)}
                      className={`p-3 border rounded-lg cursor-pointer text-sm ${
                        assistiveTech.includes(tech)
                          ? 'border-terracotta bg-terracotta/10'
                          : 'border-espresso/15 hover:border-espresso/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={assistiveTech.includes(tech)} />
                        <span>{tech}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Communication Skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Sign Language Proficiency</Label>
                    <Select value={signLanguage} onValueChange={(v) => setSignLanguage(v as ProficiencyLevel)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="fluent">Fluent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Braille Proficiency</Label>
                    <Select value={braille} onValueChange={(v) => setBraille(v as ProficiencyLevel)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="fluent">Fluent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={aacExperience} onCheckedChange={setAacExperience} />
                  <Label>Experience with AAC (Augmentative and Alternative Communication) devices</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {}
          <TabsContent value="availability">
            <Card>
              <CardHeader>
                <CardTitle>Student Preferences</CardTitle>
                <CardDescription>
                  Configure your availability for students with special needs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">Accept IEP/504 Students</div>
                    <div className="text-sm text-espresso/55">
                      Students with Individualized Education Programs or 504 plans
                    </div>
                  </div>
                  <Switch checked={acceptsIEP} onCheckedChange={setAcceptsIEP} />
                </div>

                <div>
                  <Label>Maximum Students with Special Needs (at a time)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={maxSpecialNeeds}
                      onChange={(e) => setMaxSpecialNeeds(parseInt(e.target.value) || 1)}
                      className="w-24"
                    />
                    <span className="text-espresso/55">students</span>
                  </div>
                  <p className="text-sm text-espresso/55 mt-1">
                    This helps us match students appropriately based on your capacity.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 bg-terracotta/10 border-terracotta/30">
              <CardContent className="p-6">
                <h3 className="font-medium text-espresso mb-2">Why this matters</h3>
                <p className="text-sm text-terracotta-500">
                  Your specialization profile helps us match you with students who will benefit most
                  from your expertise. Students and their families can filter teachers based on
                  these specializations, ensuring they find educators who understand their unique needs.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {}
        <div className="mt-8 flex justify-end gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Specialization'}
          </Button>
        </div>
      </div>
        </div>
      </main>
    </div>
  );
}
