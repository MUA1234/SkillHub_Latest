'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UploadProgress } from '@/components/ui/upload-progress';
import { useTeachingMode } from '@/contexts/TeachingModeContext';
import { teachingModeConfig } from '@/lib/teaching-mode';
import TeachingModeDropdown from '@/components/teacher/TeachingModeDropdown';
import {
  FileText,
  Upload,
  Download,
  Folder,
  BookOpen,
  Video,
  X,
  File,
  ArrowLeft,
  Accessibility,
  Subtitles,
  Volume2,
  Eye,
  Ear,
  Brain,
  CheckCircle2
} from 'lucide-react';

const ContentUploadPage = () => {
  const router = useRouter();
  const { mode } = useTeachingMode();
  const modeCfg = teachingModeConfig(mode);
  const restricted = mode !== 'general'; // visual → audio only, hearing → video only
  const [fileData, setFileData] = useState({
    title: '',
    subject: '',
    grade: '',
    folder: 'lessons',
    description: '',
    content_type: 'document'
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // The one required question the restricted modes ask:
  //   visual  → "does this contain visual symbols a sighted student relies on?"
  //   hearing → "does this video include sign language?"
  const [restrictedAnswer, setRestrictedAnswer] = useState<boolean | null>(null);

  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState('');
  const [uploadError, setUploadError] = useState<string>('');

  const [targetDisabilityTypes, setTargetDisabilityTypes] = useState<string[]>([]);
  const [isAccessibleForAll, setIsAccessibleForAll] = useState(true);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [hasTranscripts, setHasTranscripts] = useState(false);
  const [hasAudioDescription, setHasAudioDescription] = useState(false);
  const [hasSignLanguage, setHasSignLanguage] = useState(false);
  const [requiresVision, setRequiresVision] = useState(true);
  const [requiresHearing, setRequiresHearing] = useState(true);
  const [cognitiveLevel, setCognitiveLevel] = useState(3);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const onUploadProgress = (pct: number, bps?: number) => {
    setUploadProgress(pct);
    if (bps != null) setUploadSpeed(bps);
  };

  useEffect(() => {
    (async () => {
      try {
        const resp = await apiClient.getTeacherCourses();
        const list = Array.isArray(resp?.courses)
          ? resp.courses
          : Array.isArray(resp)
            ? resp
            : Array.isArray(resp?.data)
              ? resp.data
              : [];
        setCourses(list);
        if (list.length === 1) setCourseId(String(list[0].id));
      } catch {
        setCourses([]);
      }
    })();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFileData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension);
      const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension);
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension);

      // Mode wall: Visual accepts audio only, Hearing accepts video only.
      if (mode === 'visual' && !isAudio) {
        setUploadError('Visual (audio) mode accepts audio files only — e.g. MP3, WAV or M4A audiobooks.');
        e.target.value = '';
        return;
      }
      if (mode === 'hearing' && !isVideo) {
        setUploadError('Hearing (video) mode accepts video files only — e.g. MP4, MOV or WebM.');
        e.target.value = '';
        return;
      }

      setUploadError('');
      setSelectedFile(file);
      const detected = isVideo ? 'video' : isAudio ? 'audio' : isImage ? 'image' : 'document';
      // In a restricted mode the content_type is fixed by the mode.
      setFileData(prev => ({ ...prev, content_type: restricted ? modeCfg.forcedContentType || detected : detected }));
    }
  };

  const toggleDisabilityType = (type: string) => {
    setTargetDisabilityTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
    
    if (!targetDisabilityTypes.includes(type)) {
      setIsAccessibleForAll(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');
    if (!selectedFile) {
      setUploadError('Please select a file to upload.');
      return;
    }
    if (!fileData.title.trim()) {
      setUploadError('Please give the content a title.');
      return;
    }
    if (!courseId) {
      setUploadError('Please pick a course/folder this content belongs to.');
      return;
    }
    if (restricted && restrictedAnswer === null) {
      setUploadError(
        mode === 'visual'
          ? 'Please answer whether this material contains visual symbols before uploading.'
          : 'Please answer whether this video includes sign language before uploading.',
      );
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const form = new FormData();

      // Video/audio go straight to R2 (fast, no server round-trip); we then
      // send only the object key. Images/documents keep the direct-file path.
      const isMedia = fileData.content_type === 'video' || fileData.content_type === 'audio';
      if (isMedia) {
        // Big video/audio → the R2 PUT drives the progress bar.
        const { key } = await apiClient.uploadMediaToR2(
          selectedFile,
          fileData.content_type === 'audio' ? 'audio' : 'media',
          onUploadProgress,
        );
        form.append('r2_key', key);
        form.append('r2_file_size', String(selectedFile.size));
      } else {
        form.append('file', selectedFile);
      }
      form.append('course_id', courseId);
      form.append('title', fileData.title.trim());
      form.append('description', fileData.description || '');
      form.append('content_type', fileData.content_type);
      form.append('access_level', 'free');
      form.append('is_downloadable', 'true');
      // Teaching-mode context: the backend uses this to wire the media into the
      // right track library (visual → audio_url, hearing → sign_language video).
      form.append('accessibility_track', modeCfg.track);
      if (restricted) {
        // In Visual/Hearing mode the mode implies the audience; skip the generic
        // multi-select and send the mode's disability tags + the symbols answer.
        const trackTypes = mode === 'visual'
          ? ['visual_impairment_blind', 'visual_impairment_low_vision']
          : ['hearing_impairment_deaf', 'hearing_impairment_hard_of_hearing'];
        form.append('target_disability_types', JSON.stringify(trackTypes));
        form.append('is_accessible_for_all', 'false');
        form.append('cognitive_level', String(cognitiveLevel));
        form.append('has_transcripts', 'false');
        form.append('has_audio_description', 'false');
        if (mode === 'visual') {
          // "Does it contain visual symbols a sighted student relies on?"
          form.append('contains_readable_symbols', String(restrictedAnswer === true));
          form.append('requires_vision', String(restrictedAnswer === true));
          form.append('requires_hearing', 'true'); // audio needs hearing
          form.append('has_captions', 'false');
          form.append('has_sign_language', 'false');
        } else {
          // Hearing: "Does this video include sign language?" Only signed videos
          // reach deaf students (backend gates sign_language_video_url on this).
          form.append('has_sign_language', String(restrictedAnswer === true));
          form.append('requires_vision', 'true'); // they watch the signing
          form.append('requires_hearing', 'false');
          form.append('has_captions', 'false');
        }
      } else {
        form.append(
          'target_disability_types',
          JSON.stringify(isAccessibleForAll ? [] : targetDisabilityTypes),
        );
        form.append('is_accessible_for_all', String(isAccessibleForAll));
        form.append('requires_vision', String(requiresVision));
        form.append('requires_hearing', String(requiresHearing));
        form.append('cognitive_level', String(cognitiveLevel));
        form.append('has_captions', String(hasCaptions));
        form.append('has_transcripts', String(hasTranscripts));
        form.append('has_audio_description', String(hasAudioDescription));
        form.append('has_sign_language', String(hasSignLanguage));
      }

      // For images/docs the file rides in this POST, so it drives the bar.
      // For media the bytes already went to R2; this is just a tiny metadata
      // POST, so we don't reset the bar (it stays at 100 / "Finishing up…").
      await apiClient.uploadFormWithProgress(
        '/api/v1/teachers/content/upload',
        form,
        isMedia ? undefined : onUploadProgress,
      );

      router.push('/teachers/content');
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error?.message || 'Failed to upload content. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const folders = [
    { id: 'lessons', name: 'Lesson Plans', icon: BookOpen },
    { id: 'presentations', name: 'Presentations', icon: FileText },
    { id: 'videos', name: 'Video Content', icon: Video },
    { id: 'assessments', name: 'Assessments', icon: FileText },
    { id: 'resources', name: 'Resources', icon: Folder }
  ];

  const disabilityTypes = [
    { id: 'dyslexia', name: 'Dyslexia', icon: BookOpen, description: 'Reading/text processing difficulties' },
    { id: 'adhd', name: 'ADHD', icon: Brain, description: 'Attention and focus challenges' },
    { id: 'asd', name: 'Autism', icon: Brain, description: 'Autism Spectrum' },
    { id: 'hearing_impairment_deaf', name: 'Deaf', icon: Ear, description: 'Complete hearing loss' },
    { id: 'hearing_impairment_hard_of_hearing', name: 'Hard of Hearing', icon: Ear, description: 'Partial hearing loss' },
    { id: 'visual_impairment_blind', name: 'Blind', icon: Eye, description: 'Complete vision loss' },
    { id: 'visual_impairment_low_vision', name: 'Low Vision', icon: Eye, description: 'Partial vision loss' },
    { id: 'dysgraphia', name: 'Dysgraphia', icon: FileText, description: 'Writing difficulties' },
    { id: 'dyscalculia', name: 'Dyscalculia', icon: Brain, description: 'Math difficulties' },
    { id: 'physical_disability_mobility', name: 'Mobility Issues', icon: Accessibility, description: 'Physical mobility limitations' },
  ];

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole="teacher"
        userName="Teacher"
        userEmail=""
      />
      <DashboardSidebar userRole="teacher" />
      
      <div className="pt-20 pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center mb-2">
                <button 
                  onClick={() => router.back()}
                  className="mr-3 text-teacher-600 hover:text-teacher-800"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <PageHeader title="Upload a" accent="new lesson" />
              </div>
              <p className="text-espresso/70 ml-8">
                Add new educational materials to your library
              </p>
            </div>
          </div>

          <TeachingModeDropdown />

          <div className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid p-6">
            <form onSubmit={handleSubmit}>
              {uploadError && (
                <div className="mb-4 rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
                  {uploadError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Course
                  </label>
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    required
                  >
                    <option value="">
                      {courses.length === 0
                        ? 'No courses yet — create one in Content Management first'
                        : 'Select a course…'}
                    </option>
                    {courses.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.title || 'Untitled course'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={fileData.title}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    placeholder="Advanced Calculus - Derivatives"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={fileData.subject}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    placeholder="Mathematics"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Grade/Level
                  </label>
                  <input
                    type="text"
                    name="grade"
                    value={fileData.grade}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    placeholder="Grade 12"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Folder
                  </label>
                  <select
                    name="folder"
                    value={fileData.folder}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    required
                  >
                    {folders.map(folder => {
                      const Icon = folder.icon;
                      return (
                        <option key={folder.id} value={folder.id}>
                          <div className="flex items-center">
                            <Icon className="w-4 h-4 mr-2" />
                            {folder.name}
                          </div>
                        </option>
                      );
                    })}
                  </select>
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={fileData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    placeholder="Describe your content..."
                    required
                  />
                </div>
              </div>

              {}
              {!restricted && (
              <Card className="mb-6 border-2 border-blue-100 bg-terracotta/10/30">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Accessibility className="h-5 w-5 text-terracotta" />
                    <CardTitle className="text-lg">Accessibility Features</CardTitle>
                  </div>
                  <CardDescription>
                    Help students find content that matches their accessibility needs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {}
                  <div className="p-4 bg-cream-50 rounded-lg border">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="accessible-all"
                        checked={isAccessibleForAll}
                        onCheckedChange={(checked) => {
                          setIsAccessibleForAll(checked as boolean);
                          if (checked) {
                            setTargetDisabilityTypes([]);
                          }
                        }}
                      />
                      <div className="flex-1">
                        <Label htmlFor="accessible-all" className="font-semibold text-base cursor-pointer">
                          ✅ Accessible for All Students
                        </Label>
                        <p className="text-sm text-espresso/70 mt-1">
                          This content is designed to be accessible to students with any type of disability
                        </p>
                      </div>
                    </div>
                  </div>

                  {}
                  {!isAccessibleForAll && (
                    <div>
                      <h4 className="font-medium text-espresso mb-3">
                        Or select specific disabilities this content is designed for:
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {disabilityTypes.map((type) => {
                          const Icon = type.icon;
                          const isSelected = targetDisabilityTypes.includes(type.id);
                          return (
                            <div
                              key={type.id}
                              onClick={() => toggleDisabilityType(type.id)}
                              className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-terracotta bg-terracotta/10'
                                  : 'border-espresso/15 hover:border-espresso/20 bg-cream-50'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <Checkbox checked={isSelected} className="mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-espresso/70" />
                                    <span className="font-medium text-sm">{type.name}</span>
                                  </div>
                                  <p className="text-xs text-espresso/55 mt-0.5">{type.description}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {targetDisabilityTypes.length > 0 && (
                        <div className="mt-3 p-3 bg-forest/10 border border-forest/30 rounded-lg">
                          <p className="text-sm text-forest-500">
                            ✓ Selected {targetDisabilityTypes.length} disability type(s)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {}
                  {(fileData.content_type === 'video' || fileData.content_type === 'audio') && (
                    <div className="space-y-3 p-4 bg-cream-50 rounded-lg border">
                      <h4 className="font-medium text-espresso mb-2">Media Accessibility Features</h4>
                      
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="has-captions"
                          checked={hasCaptions}
                          onCheckedChange={(checked) => setHasCaptions(checked as boolean)}
                        />
                        <div>
                          <Label htmlFor="has-captions" className="font-medium cursor-pointer flex items-center gap-2">
                            <Subtitles className="h-4 w-4 text-terracotta" />
                            Has Captions/Subtitles
                          </Label>
                          <p className="text-xs text-espresso/55 mt-0.5">
                            Closed captions or subtitles available
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="has-transcripts"
                          checked={hasTranscripts}
                          onCheckedChange={(checked) => setHasTranscripts(checked as boolean)}
                        />
                        <div>
                          <Label htmlFor="has-transcripts" className="font-medium cursor-pointer flex items-center gap-2">
                            <FileText className="h-4 w-4 text-forest" />
                            Has Transcript
                          </Label>
                          <p className="text-xs text-espresso/55 mt-0.5">
                            Full text transcript available for download
                          </p>
                        </div>
                      </div>

                      {fileData.content_type === 'video' && (
                        <>
                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id="has-audio-desc"
                              checked={hasAudioDescription}
                              onCheckedChange={(checked) => setHasAudioDescription(checked as boolean)}
                            />
                            <div>
                              <Label htmlFor="has-audio-desc" className="font-medium cursor-pointer flex items-center gap-2">
                                <Volume2 className="h-4 w-4 text-coral" />
                                Has Audio Description
                              </Label>
                              <p className="text-xs text-espresso/55 mt-0.5">
                                Narrated description of visual elements
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id="has-sign-language"
                              checked={hasSignLanguage}
                              onCheckedChange={(checked) => setHasSignLanguage(checked as boolean)}
                            />
                            <div>
                              <Label htmlFor="has-sign-language" className="font-medium cursor-pointer flex items-center gap-2">
                                <Accessibility className="h-4 w-4 text-terracotta" />
                                Has Sign Language Interpreter
                              </Label>
                              <p className="text-xs text-espresso/55 mt-0.5">
                                Sign language interpretation included
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {}
                  <div className="space-y-3 p-4 bg-cream-50 rounded-lg border">
                    <h4 className="font-medium text-espresso mb-2">Content Requirements</h4>
                    
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="requires-vision"
                        checked={requiresVision}
                        onCheckedChange={(checked) => setRequiresVision(checked as boolean)}
                      />
                      <div>
                        <Label htmlFor="requires-vision" className="font-medium cursor-pointer">
                          Requires Vision
                        </Label>
                        <p className="text-xs text-espresso/55 mt-0.5">
                          Content requires ability to see (visual elements essential)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="requires-hearing"
                        checked={requiresHearing}
                        onCheckedChange={(checked) => setRequiresHearing(checked as boolean)}
                      />
                      <div>
                        <Label htmlFor="requires-hearing" className="font-medium cursor-pointer">
                          Requires Hearing
                        </Label>
                        <p className="text-xs text-espresso/55 mt-0.5">
                          Content requires ability to hear (audio elements essential)
                        </p>
                      </div>
                    </div>
                  </div>

                  {}
                  <div className="p-4 bg-cream-50 rounded-lg border">
                    <Label className="font-medium text-espresso mb-2 block">
                      Cognitive Difficulty Level
                    </Label>
                    <div className="flex items-center gap-4">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setCognitiveLevel(level)}
                          className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            cognitiveLevel === level
                              ? 'border-terracotta bg-terracotta/10 text-terracotta-500'
                              : 'border-espresso/15 bg-cream-50 text-espresso/70 hover:border-espresso/20'
                          }`}
                        >
                          {level === 1 && 'Very Easy'}
                          {level === 2 && 'Easy'}
                          {level === 3 && 'Medium'}
                          {level === 4 && 'Hard'}
                          {level === 5 && 'Very Hard'}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-espresso/55 mt-2">
                      Help students find content at their cognitive ability level
                    </p>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Focused panel for Visual / Hearing modes: mode implies the
                  audience, so we only ask the one question that matters. */}
              {restricted && (
                <Card className={`mb-6 border-2 ${mode === 'visual' ? 'border-forest/30 bg-forest/5' : 'border-coral/30 bg-coral/5'}`}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {mode === 'visual' ? <Eye className="h-5 w-5 text-forest" /> : <Ear className="h-5 w-5 text-coral" />}
                      <CardTitle className="text-lg">{modeCfg.label} · accessibility</CardTitle>
                    </div>
                    <CardDescription>{modeCfg.uploadRule}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-cream-50 rounded-lg border">
                      <Label className="font-semibold text-base block mb-1">
                        {mode === 'visual'
                          ? 'Does this material contain symbols a normal student can understand?'
                          : 'Does this video include sign language?'}
                      </Label>
                      <p className="text-sm text-espresso/70 mb-3">
                        {mode === 'visual'
                          ? 'For example, equations, charts or diagrams shown on screen that a sighted student would need to see. If yes, we flag that a blind student may need them described.'
                          : 'Deaf and hard-of-hearing students learn through sign language, so only signed videos are shared with them — this makes sure they can watch and understand it.'}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {(mode === 'visual'
                          ? [{ v: true, label: 'Yes, it has visual symbols' }, { v: false, label: 'No, it stands on its own' }]
                          : [{ v: true, label: 'Yes, it has sign language' }, { v: false, label: 'No sign language' }]
                        ).map((opt) => (
                          <button
                            key={String(opt.v)}
                            type="button"
                            onClick={() => setRestrictedAnswer(opt.v)}
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                              restrictedAnswer === opt.v
                                ? 'border-terracotta bg-terracotta/10 text-terracotta-500'
                                : 'border-espresso/15 bg-cream-50 text-espresso/70 hover:border-espresso/30'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {mode === 'hearing' && restrictedAnswer === false && (
                        <p className="text-xs text-coral mt-3 font-medium">
                          Heads up: without sign language, this video won&apos;t be shared with your deaf students. Upload a signed version so they can follow it.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {}
              <div className="grid grid-cols-1 gap-6 mb-6">

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    {restricted ? (mode === 'visual' ? 'Select an audio file (audiobook)' : 'Select a video file') : 'Select File'}
                  </label>
                  <div className="border-2 border-dashed border-espresso/20 rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 text-espresso/45 mx-auto mb-3" />
                    <p className="text-espresso/70 mb-4">
                      {restricted ? modeCfg.uploadRule : 'Drag & drop files here or click to browse'}
                    </p>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      accept={modeCfg.accept || undefined}
                      className="hidden"
                      id="file-upload"
                      required
                    />
                    <label 
                      htmlFor="file-upload" 
                      className="inline-block bg-teacher-600 text-white px-6 py-2 rounded-lg hover:bg-teacher-700 transition-colors cursor-pointer"
                    >
                      Browse Files
                    </label>
                    {selectedFile && (
                      <div className="mt-4 p-3 bg-cream-100 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <File className="w-5 h-5 text-espresso/55 mr-2" />
                            <span className="text-espresso">{selectedFile.name}</span>
                          </div>
                          <span className="text-xs text-espresso/55">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {}
              {(targetDisabilityTypes.length > 0 || hasCaptions || hasTranscripts || hasAudioDescription || hasSignLanguage) && (
                <div className="mb-6 p-4 bg-forest/10 border border-forest/30 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Accessibility Features Applied
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {isAccessibleForAll && (
                      <Badge className="bg-forest">Accessible for All</Badge>
                    )}
                    {targetDisabilityTypes.map(type => (
                      <Badge key={type} variant="secondary" className="bg-terracotta/15 text-terracotta-500">
                        {disabilityTypes.find(d => d.id === type)?.name}
                      </Badge>
                    ))}
                    {hasCaptions && <Badge variant="secondary">Captions</Badge>}
                    {hasTranscripts && <Badge variant="secondary">Transcript</Badge>}
                    {hasAudioDescription && <Badge variant="secondary">Audio Description</Badge>}
                    {hasSignLanguage && <Badge variant="secondary">Sign Language</Badge>}
                  </div>
                </div>
              )}

              {uploading && (
                <div className="mb-4">
                  <UploadProgress value={uploadProgress} speed={uploadSpeed} label="Uploading content" />
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-6 py-3 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 disabled:opacity-50"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 flex items-center gap-2"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      Upload Content
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentUploadPage;