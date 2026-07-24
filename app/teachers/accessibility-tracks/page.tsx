'use client';

/**
 * Teacher: attach accessibility tracks to a content item.
 *
 * Surfaces the Phase G4 PATCH endpoint
 * (PATCH /teachers/content/:id/accessibility-tracks). The teacher pastes
 * the content_id (or arrives via a link from a content listing) and the
 * URLs they've uploaded to Supabase Storage (or any reachable CDN). The
 * backend accepts any subset of caption_url / transcript_url /
 * audio_description_url / sign_language_video_url and persists them onto
 * the course_content row.
 *
 * We don't ship a file-upload widget here on purpose: the upload target
 * (Supabase Storage / Bunny CDN / external host) varies per teacher and
 * a generic uploader would be a leaky abstraction. This page is the
 * minimal authoring surface — the teacher attaches existing URLs and
 * the accessible <VideoPlayer> picks them up automatically.
 */

import React, { useState } from 'react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Hand, Headphones, Subtitles, FileText, CheckCircle2, Upload, Loader2 } from 'lucide-react';
import { apiClient, getCurrentUser } from '@/lib/api';
import { UploadProgress } from '@/components/ui/upload-progress';

type TrackKind = 'caption' | 'transcript' | 'audio' | 'sign_video';

interface TrackFieldProps {
  kind: TrackKind;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  acceptAttr: string;
}

/** Inline file picker that uploads to /accessibility-tracks/upload and
 *  writes the returned URL into the parent's text input. Falls back to
 *  manual URL entry if the upload fails so we never strand a teacher. */
function TrackFileField({ kind, value, onChange, placeholder, acceptAttr }: TrackFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    setProgress(0);
    try {
      const form = new FormData();
      form.append('track_type', kind);
      form.append('file', file);
      const json: any = await apiClient.uploadFormWithProgress(
        '/api/v1/teachers/accessibility-tracks/upload',
        form,
        setProgress,
      );
      if (json?.url) {
        onChange(json.url);
      } else {
        throw new Error('Upload returned no URL.');
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-cream-50 text-espresso border-2 border-espresso/15 hover:border-espresso/40 cursor-pointer transition-colors">
          {uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              Upload file
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={acceptAttr}
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs font-semibold text-espresso/55 hover:text-espresso"
          >
            Clear
          </button>
        )}
        {uploadError && <span className="text-xs text-coral-400">{uploadError}</span>}
      </div>
      {uploading && <UploadProgress value={progress} label="Uploading" />}
    </div>
  );
}

interface Tracks {
  caption_url: string;
  transcript_url: string;
  audio_description_url: string;
  sign_language_video_url: string;
}

const empty: Tracks = {
  caption_url: '',
  transcript_url: '',
  audio_description_url: '',
  sign_language_video_url: '',
};

export default function TeacherAccessibilityTracksPage() {
  const [contentId, setContentId] = useState('');
  const [tracks, setTracks] = useState<Tracks>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const id = contentId.trim();
    if (!id) {
      setError('Content id is required.');
      return;
    }

    const payload: Partial<Tracks> = {};
    (Object.keys(tracks) as Array<keyof Tracks>).forEach((k) => {
      if (tracks[k].trim()) payload[k] = tracks[k].trim();
    });
    if (Object.keys(payload).length === 0) {
      setError('Fill at least one track URL.');
      return;
    }

    setBusy(true);
    try {
      await apiClient.updateContentAccessibilityTracks(id, payload);
      setSuccess(`Saved ${Object.keys(payload).length} track(s) on ${id}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to save tracks.');
    } finally {
      setBusy(false);
    }
  };

  const clearField = (k: keyof Tracks) => setTracks({ ...tracks, [k]: '' });

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="teacher" userName={userName} userEmail={userEmail} />
      <DashboardSidebar userRole="teacher" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0 max-w-3xl mx-auto">
          <div className="mb-6">
            <PageHeader title="Accessibility" accent="tracks" />
            <p className="text-sm text-espresso/70 mt-2">
              Attach captions, transcripts, audio descriptions, or sign-language
              video to a lesson. Students who need them will see them automatically
              inside the player. Paste a URL you've already uploaded — Supabase
              Storage, a CDN, or any public-reachable address.
            </p>
          </div>

          {error && (
            <div className="bg-coral/10 text-coral border border-coral/30 rounded p-3 mb-4 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-forest/10 text-forest-500 border border-forest/30 rounded p-3 mb-4 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <Label htmlFor="content-id">Content id</Label>
                <Input
                  id="content-id"
                  value={contentId}
                  onChange={(e) => setContentId(e.target.value)}
                  placeholder="e.g. 2f3a…  (UUID of the course_content row)"
                />
                <p className="text-xs text-espresso/55 mt-1">
                  You can find this in the URL of the content viewer / edit page.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Subtitles className="w-4 h-4 text-terracotta" />
                  Captions (WebVTT)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <TrackFileField
                  kind="caption"
                  value={tracks.caption_url}
                  onChange={(v) => setTracks({ ...tracks, caption_url: v })}
                  placeholder="https://…/captions.vtt"
                  acceptAttr=".vtt,.srt,text/vtt,application/x-subrip,text/plain"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-coral" />
                  Transcript (.txt / .html / .pdf)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <TrackFileField
                  kind="transcript"
                  value={tracks.transcript_url}
                  onChange={(v) => setTracks({ ...tracks, transcript_url: v })}
                  placeholder="https://…/transcript.txt"
                  acceptAttr=".txt,.html,.pdf,text/plain,text/html,application/pdf"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Headphones className="w-4 h-4 text-terracotta" />
                  Audio description (.mp3 / .m4a)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <TrackFileField
                  kind="audio"
                  value={tracks.audio_description_url}
                  onChange={(v) => setTracks({ ...tracks, audio_description_url: v })}
                  placeholder="https://…/described.mp3"
                  acceptAttr="audio/*,.mp3,.m4a,.wav,.ogg"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hand className="w-4 h-4 text-forest" />
                  Sign-language interpreter video
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <TrackFileField
                  kind="sign_video"
                  value={tracks.sign_language_video_url}
                  onChange={(v) => setTracks({ ...tracks, sign_language_video_url: v })}
                  placeholder="https://…/signing.mp4"
                  acceptAttr="video/*,.mp4,.webm,.mov"
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={busy} className="btn-kid-primary">
                {busy ? 'Saving…' : 'Save tracks'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
