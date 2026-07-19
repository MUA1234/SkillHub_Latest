'use client';

import React, { useState, useEffect } from 'react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ReadAloudButton } from '@/components/accessibility/ReadAloudButton';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { useTranslation } from '@/hooks/use-translation';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { apiClient } from '@/lib/api';
import {
  isLessonOffline,
  saveLessonOffline,
  removeOfflineLesson,
  formatBytes,
} from '@/lib/offline';
import {
  Play,
  Clock,
  User,
  Filter,
  Search,
  BookOpen,
  Subtitles,
  FileText,
  Volume2,
  CheckCircle2,
  Star,
  X,
  Download,
  Trash2
} from 'lucide-react';

interface AccessibilityFeatures {
  has_captions: boolean;
  has_transcripts: boolean;
  has_audio_description: boolean;
  has_sign_language: boolean;
  caption_url?: string;
  transcript_url?: string;
  audio_description_url?: string;
  target_disability_types: string[];
  cognitive_level: number;
  relevance_score?: number;
}

interface Lesson {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail_url: string;
  course_id: string;
  course_title: string;
  teacher_name: string;
  teacher_avatar?: string;
  subject_name: string;
  subject_category?: string;
  accessibility_features: AccessibilityFeatures;
  created_at: string;
}

export default function PreRecordedLessonsPage() {
  const { t } = useTranslation();
  const { preferences } = useAccessibility();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeDetails, setActiveDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [progressNote, setProgressNote] = useState<string>('');
  const startTimeRef = React.useRef<number>(0);

  const openLesson = async (lesson: Lesson) => {
    setActiveLesson(lesson);
    setActiveDetails(null);
    setLoadingDetails(true);
    startTimeRef.current = Date.now();
    try {
      const details = await apiClient.getContentDetails(lesson.id);
      setActiveDetails(details?.data || details || {});
    } catch (e) {
      console.error('Failed to load content details:', e);
      setActiveDetails({});
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeLesson = () => {
    setActiveLesson(null);
    setActiveDetails(null);
    setProgressNote('');
  };

  const handleProgress = async (pos: number, dur: number) => {
    if (!activeLesson || !dur) return;
    const pct = Math.min(100, Math.round((pos / dur) * 100));
    const elapsedMin = Math.max(
      1,
      Math.round((Date.now() - startTimeRef.current) / 60000),
    );
    try {
      await apiClient.updateContentProgress(activeLesson.id, {
        progress_percentage: pct,
        time_spent_minutes: elapsedMin,
        is_completed: pct >= 90,
      });
      setProgressNote(t('content.progressSaved', 'Progress saved'));
      window.setTimeout(() => setProgressNote(''), 1500);
    } catch (e) {
    }
  };

  const [offlineSaved, setOfflineSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    bytes: number;
    total: number | null;
  } | null>(null);

  useEffect(() => {
    if (!activeLesson) {
      setOfflineSaved(false);
      setDownloadProgress(null);
      return;
    }
    isLessonOffline(activeLesson.id)
      .then(setOfflineSaved)
      .catch(() => setOfflineSaved(false));
  }, [activeLesson]);

  const handleSaveOffline = async () => {
    if (!activeLesson || !activeDetails?.content_url) return;
    setDownloading(true);
    setDownloadProgress({ bytes: 0, total: null });
    try {
      await saveLessonOffline(
        {
          id: activeLesson.id,
          title: activeLesson.title,
          courseTitle: activeLesson.course_title,
          teacherName: activeLesson.teacher_name,
          contentUrl: activeDetails.content_url,
          captionUrl:
            activeDetails.caption_url ||
            activeLesson.accessibility_features.caption_url,
          transcriptUrl:
            activeDetails.transcript_url ||
            activeLesson.accessibility_features.transcript_url,
        },
        (b, t) => setDownloadProgress({ bytes: b, total: t }),
      );
      setOfflineSaved(true);
    } catch (e) {
      console.error('Offline save failed:', e);
      setProgressNote(t('content.offline.failed', 'Offline save failed'));
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleRemoveOffline = async () => {
    if (!activeLesson) return;
    try {
      await removeOfflineLesson(activeLesson.id);
      setOfflineSaved(false);
    } catch (e) {
      console.error('Offline remove failed:', e);
    }
  };

  const handleComplete = async () => {
    if (!activeLesson) return;
    try {
      await apiClient.updateContentProgress(activeLesson.id, {
        progress_percentage: 100,
        time_spent_minutes: Math.max(
          1,
          Math.round((Date.now() - startTimeRef.current) / 60000),
        ),
        is_completed: true,
      });
      setProgressNote(t('content.completed', 'Completed'));
    } catch {}
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [studentDisabilityTypes, setStudentDisabilityTypes] = useState<string[]>([]);
  
  const [filterCaptions, setFilterCaptions] = useState(false);
  const [filterTranscripts, setFilterTranscripts] = useState(false);
  const [filterAudioDesc, setFilterAudioDesc] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchLessons();
  }, [page, filterCaptions, filterTranscripts, filterAudioDesc]);

  const fetchLessons = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        has_captions: filterCaptions.toString(),
        has_transcripts: filterTranscripts.toString(),
        has_audio_description: filterAudioDesc.toString(),
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/students/pre-recorded-lessons?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch lessons');
      }

      const result = await response.json();
      setLessons(result.data.lessons);
      setStudentDisabilityTypes(result.data.student_disability_types || []);
      setTotal(result.data.pagination.total);
      setTotalPages(result.data.pagination.total_pages);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDisabilityLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'dyslexia': 'Dyslexia',
      'adhd': 'ADHD',
      'asd': 'Autism',
      'hearing_impairment_deaf': 'Deaf',
      'hearing_impairment_hard_of_hearing': 'Hard of Hearing',
      'visual_impairment_blind': 'Blind',
      'visual_impairment_low_vision': 'Low Vision',
      'dysgraphia': 'Dysgraphia',
      'dyscalculia': 'Dyscalculia',
    };
    return labels[type] || type;
  };

  const filteredLessons = lessons.filter((lesson) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      lesson.title.toLowerCase().includes(query) ||
      lesson.description?.toLowerCase().includes(query) ||
      lesson.course_title.toLowerCase().includes(query) ||
      lesson.teacher_name.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
          <div className="max-w-7xl mx-auto">
        {}
        <div className="mb-8">
          <PageHeader title="Lessons that" accent="wait for you" />
          <p className="text-espresso/70">
            Video lessons tailored to your accessibility needs
          </p>
          
          {}
          {studentDisabilityTypes.length > 0 && (
            <div className="mt-4 p-5 bg-terracotta-50 border-2 border-terracotta-200 rounded-2xl shadow-kid animate-slide-down">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-terracotta border-2 border-espresso rounded-full flex items-center justify-center shadow-sticker-sm">
                    <span className="text-xl">🎯</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-espresso mb-2">
                    Personalized for your needs
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {studentDisabilityTypes.map((type) => (
                      <span key={type} className="badge-primary">
                        {getDisabilityLabel(type)}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-terracotta-500">
                    ✨ Lessons are automatically filtered to show content best suited for you
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 h-5 w-5" />
              <Input
                type="text"
                placeholder="Search lessons..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>

          {}
          {showFilters && (
            <div className="card-elevated p-5 animate-slide-down">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="captions"
                    checked={filterCaptions}
                    onCheckedChange={(checked) => setFilterCaptions(checked as boolean)}
                  />
                  <Label htmlFor="captions" className="flex items-center gap-2 cursor-pointer">
                    <Subtitles className="h-4 w-4 text-terracotta" />
                    Has Captions
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="transcripts"
                    checked={filterTranscripts}
                    onCheckedChange={(checked) => setFilterTranscripts(checked as boolean)}
                  />
                  <Label htmlFor="transcripts" className="flex items-center gap-2 cursor-pointer">
                    <FileText className="h-4 w-4 text-forest" />
                    Has Transcripts
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="audio-desc"
                    checked={filterAudioDesc}
                    onCheckedChange={(checked) => setFilterAudioDesc(checked as boolean)}
                  />
                  <Label htmlFor="audio-desc" className="flex items-center gap-2 cursor-pointer">
                    <Volume2 className="h-4 w-4 text-coral" />
                    Audio Description
                  </Label>
                </div>
              </div>
            </div>
          )}
        </div>

        {}
        <div className="mb-4 text-sm text-espresso/70">
          Showing {filteredLessons.length} of {total} lessons
        </div>

        {}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card-elevated animate-pulse">
                <div className="h-48 skeleton rounded-t-2xl" />
                <div className="p-4 space-y-3">
                  <div className="h-4 skeleton rounded w-3/4" />
                  <div className="h-3 skeleton rounded w-1/2" />
                  <div className="h-3 skeleton rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {}
        {!loading && filteredLessons.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLessons.map((lesson) => (
              <div key={lesson.id} className="card-interactive overflow-hidden group">
                {}
                <div className="relative h-48 bg-gradient-to-br from-terracotta to-mustard overflow-hidden">
                  <img
                    src={lesson.thumbnail_url}
                    alt={lesson.title}
                    className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                    <div className="w-16 h-16 bg-cream-50 bg-opacity-90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform cursor-pointer">
                      <Play className="h-8 w-8 text-terracotta ml-1" />
                    </div>
                  </div>
                  
                  {}
                  {lesson.accessibility_features.relevance_score && lesson.accessibility_features.relevance_score > 0 && (
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-forest-300 border-2 border-espresso text-cream text-xs font-bold rounded-full shadow-sticker-sm animate-scale-in">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {lesson.accessibility_features.relevance_score}% Match
                      </span>
                    </div>
                  )}

                  {}
                  <div className="absolute bottom-3 right-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-black/80 backdrop-blur-sm text-white text-xs font-semibold rounded-lg">
                      <Clock className="h-3 w-3" />
                      {lesson.duration || '15 min'}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  {}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-lg line-clamp-2 flex-1">{lesson.title}</h3>
                    {}
                    <ReadAloudButton
                      getText={() => `${lesson.title}. ${lesson.description || ''}`}
                      compact
                    />
                  </div>

                  {}
                  <p className="text-sm text-espresso/70 mb-3 line-clamp-2">
                    {lesson.description || 'No description available'}
                  </p>

                  {}
                  <div className="flex items-center gap-2 mb-3 text-xs text-espresso/55">
                    <BookOpen className="h-3 w-3" />
                    <span className="line-clamp-1">{lesson.course_title}</span>
                  </div>

                  {}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-terracotta border border-espresso flex items-center justify-center text-cream text-xs">
                      {lesson.teacher_avatar ? (
                        <img src={lesson.teacher_avatar} alt="" className="w-full h-full rounded-full" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                    </div>
                    <span className="text-sm text-espresso">{lesson.teacher_name}</span>
                  </div>

                  {}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {lesson.accessibility_features.has_captions && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Subtitles className="h-3 w-3" />
                        Captions
                      </Badge>
                    )}
                    {lesson.accessibility_features.has_transcripts && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Transcript
                      </Badge>
                    )}
                    {lesson.accessibility_features.has_audio_description && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Volume2 className="h-3 w-3" />
                        Audio
                      </Badge>
                    )}
                  </div>

                  {}
                  <button
                    type="button"
                    onClick={() => openLesson(lesson)}
                    className="w-full btn-primary py-2.5 text-sm"
                  >
                    <Play className="h-4 w-4 mr-2 inline" />
                    {t('content.watch', 'Watch lesson')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {}
        {!loading && filteredLessons.length === 0 && (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 bg-cream-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-8 w-8 text-espresso/45" />
            </div>
            <h3 className="text-lg font-semibold text-espresso mb-2">No lessons found</h3>
            <p className="text-espresso/70 mb-4">
              {searchQuery ? 'Try adjusting your search or filters' : 'No pre-recorded lessons available yet'}
            </p>
            {(filterCaptions || filterTranscripts || filterAudioDesc) && (
              <Button
                variant="outline"
                onClick={() => {
                  setFilterCaptions(false);
                  setFilterTranscripts(false);
                  setFilterAudioDesc(false);
                }}
              >
                Clear Filters
              </Button>
            )}
          </Card>
        )}

        {}
        {!loading && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-espresso/70">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {}
      {activeLesson && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-player-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLesson();
          }}
        >
          <div className="bg-cream-50 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 p-4 border-b border-espresso/15">
              <div className="flex-1 min-w-0">
                <h2 id="lesson-player-title" className="text-lg font-semibold text-espresso truncate">
                  {activeLesson.title}
                </h2>
                <p className="text-xs text-espresso/55 truncate">
                  {activeLesson.course_title} · {activeLesson.teacher_name}
                </p>
              </div>
              {progressNote && (
                <span className="text-xs text-forest-500 bg-forest/10 px-2 py-1 rounded-full whitespace-nowrap">
                  {progressNote}
                </span>
              )}
              {}
              {activeDetails?.content_url && !downloading && (
                offlineSaved ? (
                  <button
                    type="button"
                    onClick={handleRemoveOffline}
                    className="text-xs text-coral hover:text-red-900 bg-coral/10 px-2 py-1 rounded-full flex items-center gap-1"
                    title={t('content.offline.remove', 'Remove offline copy')}
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('content.offline.saved', 'Saved')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveOffline}
                    className="text-xs text-terracotta-500 hover:text-terracotta-700 bg-terracotta/10 px-2 py-1 rounded-full flex items-center gap-1"
                    title={t('content.offline.save', 'Save for offline')}
                  >
                    <Download className="h-3 w-3" />
                    {t('content.offline.save', 'Save offline')}
                  </button>
                )
              )}
              {downloading && downloadProgress && (
                <span className="text-xs text-terracotta-500 bg-terracotta/10 px-2 py-1 rounded-full whitespace-nowrap">
                  {formatBytes(downloadProgress.bytes)}
                  {downloadProgress.total
                    ? ` / ${formatBytes(downloadProgress.total)}`
                    : ''}
                </span>
              )}
              <button
                type="button"
                onClick={closeLesson}
                className="p-1 rounded hover:bg-cream-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label={t('content.close', 'Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              {loadingDetails ? (
                <div className="aspect-video flex items-center justify-center bg-cream-100 rounded-lg">
                  <p className="text-sm text-espresso/55">{t('common.loading', 'Loading...')}</p>
                </div>
              ) : activeDetails?.content_url ? (
                <VideoPlayer
                  src={activeDetails.content_url}
                  poster={activeLesson.thumbnail_url}
                  title={activeLesson.title}
                  captionUrl={
                    activeDetails.caption_url ||
                    activeLesson.accessibility_features.caption_url
                  }
                  transcriptUrl={
                    activeDetails.transcript_url ||
                    activeLesson.accessibility_features.transcript_url
                  }
                  audioDescriptionUrl={
                    activeDetails.audio_description_url ||
                    activeLesson.accessibility_features.audio_description_url
                  }
                  signLanguageVideoUrl={activeDetails.sign_language_video_url}
                  initialAudioOnly={!!preferences.low_bandwidth_mode}
                  onProgress={handleProgress}
                  onComplete={handleComplete}
                />
              ) : (
                <div className="aspect-video flex items-center justify-center bg-cream-100 rounded-lg text-center p-6">
                  <p className="text-sm text-espresso/55">
                    {t(
                      'content.player.transcriptUnavailable',
                      'Video unavailable for this lesson.',
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}
