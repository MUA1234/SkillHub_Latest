'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Sparkles, MapPin, MessageSquare, User as UserIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { DoodleSparkle } from '@/components/ui/doodle';

interface Match {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  location?: string | null;
  score: number;
  reasons: string[];
}

export default function PeerMatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPeerId, setBusyPeerId] = useState<string | null>(null);

  const startConversation = async (peer: Match) => {
    setBusyPeerId(peer.user_id);
    setError(null);
    try {
      const res = await apiClient.startConversationWith(peer.user_id);
      const id = res?.data?.id;
      router.push(id ? `/students/chat?conversation=${encodeURIComponent(id)}` : '/students/chat');
    } catch (e: any) {
      setError(e?.message || 'Could not start conversation.');
    } finally {
      setBusyPeerId(null);
    }
  };

  useEffect(() => {
    apiClient.getPeerMatches()
      .then((r) => setMatches(r.matches || []))
      .catch((e) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="max-w-5xl mx-auto space-y-6 pt-6">
          <PageHeader
            eyebrow={<><DoodleSparkle className="w-4" /> Peer matches</>}
            title="Find a"
            accent="study buddy"
            body="Students suggested based on your courses, accessibility profile, language, and location."
          />

          {error && (
            <KidCard tone="cream" className="border-coral !p-4">
              <p className="text-sm text-coral font-semibold">{error}</p>
            </KidCard>
          )}

          {loading ? (
            <KidCard tone="cream" className="!p-6 text-center text-sm text-espresso/55">Finding your matches…</KidCard>
          ) : matches.length === 0 ? (
            <EmptyState
              illustration="study-group"
              title="No matches yet"
              body="Enroll in a course or fill out your profile to surface peers you'll click with."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matches.map((m, idx) => {
                const tones: any[] = ['cream', 'mustard', 'cream', 'forest', 'cream', 'terracotta'];
                const tilts: any[] = ['left', 'right', 'none', 'left', 'right', 'none'];
                const tone = tones[idx % tones.length];
                const tilt = tilts[idx % tilts.length];
                const onDark = tone === 'forest' || tone === 'terracotta' || tone === 'espresso';
                return (
                  <KidCard key={m.user_id} tone={tone} tilt={tilt} sticker>
                    <div className="flex items-start gap-3">
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt=""
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-espresso"
                        />
                      ) : (
                        <div className={`w-14 h-14 rounded-2xl border-2 border-espresso flex items-center justify-center ${onDark ? 'bg-cream/15' : 'bg-cream-100'}`}>
                          <UserIcon className="h-6 w-6" aria-hidden />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-lg truncate">{m.name}</h3>
                        {m.location && (
                          <p className={`text-xs flex items-center gap-1 mt-0.5 ${onDark ? 'opacity-80' : 'text-espresso/60'}`}>
                            <MapPin className="h-3 w-3" aria-hidden />
                            {m.location}
                          </p>
                        )}
                      </div>
                      <TagPill tone={onDark ? 'cream' : 'mustard'}>
                        {m.score} match
                      </TagPill>
                    </div>

                    {m.reasons.length > 0 && (
                      <ul className={`text-sm space-y-1.5 mt-4 ${onDark ? 'text-cream/85' : 'text-espresso/75'}`}>
                        {m.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Sparkles className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${onDark ? 'text-mustard' : 'text-terracotta'}`} aria-hidden />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      disabled={busyPeerId === m.user_id}
                      onClick={() => startConversation(m)}
                      className={`mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border-2 ${onDark ? 'bg-cream text-espresso border-cream hover:bg-cream-100' : 'bg-espresso text-cream border-espresso hover:bg-espresso-600'} transition-colors disabled:opacity-60`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      {busyPeerId === m.user_id ? 'Opening…' : 'Message'}
                    </button>
                  </KidCard>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
