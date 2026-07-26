'use client';

/**
 * Specialist matching + booking for differently-abled students.
 *
 * Lists only verified/pending specialists whose teaching track overlaps the
 * caller's (the wall is enforced server-side in
 * /api/v1/students/accessibility/specialists) and lets the student send a
 * booking request. Existing open requests are surfaced so a student can't
 * double-book.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, UserCheck, Check, X, Clock, GraduationCap, Eye, Ear } from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser } from '@/lib/api';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { Illustration } from '@/components/ui/illustration';
import { Track, trackTheme, trackLabel } from '@/lib/accessibility-tracks';

interface Specialist {
  teacher_user_id: string;
  name: string;
  avatar_url?: string | null;
  bio?: string | null;
  hourly_rate: number;
  average_rating: number;
  total_students?: number;
  years_experience?: number;
  verified_specialist: boolean;
  my_booking_status?: string | null;
}

function BookingModal({
  specialist, onClose, onConfirm, busy,
}: {
  specialist: Specialist;
  onClose: () => void;
  onConfirm: (message: string) => void;
  busy: boolean;
}) {
  const [message, setMessage] = useState('');
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Book ${specialist.name}`}>
      <div className="absolute inset-0 bg-espresso/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-cream-50 rounded-3xl border-2 border-espresso shadow-kid-lg overflow-hidden">
        <div className="flex items-center justify-between bg-espresso text-cream px-5 py-3">
          <h3 className="font-display font-bold">Book {specialist.name}</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1.5 hover:bg-cream/10 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-espresso/75">
            Send a booking request. The specialist will see it and get back to you to arrange a session.
          </p>
          <div>
            <label htmlFor="booking-msg" className="text-xs font-bold uppercase tracking-wide text-espresso/60">
              Message (optional)
            </label>
            <textarea
              id="booking-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Tell them what you'd like help with…"
              className="mt-1 w-full rounded-2xl border-2 border-espresso/15 bg-cream-100 p-3 text-sm text-espresso outline-none focus:border-espresso"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="btn-kid-ghost flex-1 !py-2 text-sm disabled:opacity-50">Cancel</button>
            <button onClick={() => onConfirm(message)} disabled={busy} className="btn-kid-primary flex-1 !py-2 text-sm disabled:opacity-60">
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FindSpecialist({ track }: { track: Track }) {
  const theme = trackTheme(track);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Specialist | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  const fetchSpecialists = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await apiClient.getAccessibilitySpecialists();
      setSpecialists(res?.data?.specialists || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load specialists');
      setSpecialists([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSpecialists(); }, []);

  const confirmBooking = async (message: string) => {
    if (!booking) return;
    setBusy(true);
    try {
      await apiClient.bookSpecialist(booking.teacher_user_id, message);
      setSpecialists((prev) =>
        prev.map((s) => (s.teacher_user_id === booking.teacher_user_id ? { ...s, my_booking_status: 'requested' } : s)),
      );
      setToast(`Request sent to ${booking.name}.`);
      setBooking(null);
    } catch (err: any) {
      setToast(err?.message || 'Could not send the request.');
    } finally {
      setBusy(false);
      setTimeout(() => setToast(''), 4000);
    }
  };

  const Icon = track === 'visual' ? Eye : Ear;

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />
      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />
        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-6 min-h-[calc(100vh-4rem)]">
          <section className={`rounded-3xl border-2 border-espresso shadow-sticker ${track === 'visual' ? 'bg-forest' : 'bg-coral'} text-cream px-5 py-5`}>
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cream/15 border-2 border-cream/30 shrink-0">
                <Icon className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cream/80">{theme.badge}</span>
                <h1 className="font-display text-2xl sm:text-3xl font-bold">Find a specialist</h1>
                <p className="text-cream/85 text-sm mt-0.5">
                  Teachers trained to support {trackLabel(track)}-track learners. You&apos;ll only ever see specialists for your track.
                </p>
              </div>
            </div>
          </section>

          {toast && (
            <div className="rounded-2xl border-2 border-espresso bg-mustard text-espresso px-4 py-3 text-sm font-semibold shadow-sticker-sm" role="status">
              {toast}
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-3xl bg-espresso/10 animate-pulse" />)}
            </div>
          ) : error ? (
            <KidCard tone="cream" className="border-coral !p-5">
              <p className="font-semibold text-espresso">Couldn&apos;t load specialists</p>
              <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
              <button onClick={fetchSpecialists} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
            </KidCard>
          ) : specialists.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {specialists.map((s) => {
                const open = s.my_booking_status === 'requested' || s.my_booking_status === 'accepted';
                return (
                  <KidCard key={s.teacher_user_id} tone="cream" sticker className="flex flex-col">
                    <div className="flex items-start gap-3">
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-espresso text-cream overflow-hidden shrink-0">
                        {s.avatar_url ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserCheck className="w-6 h-6" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-display font-bold text-lg leading-snug truncate">{s.name}</h3>
                          {s.verified_specialist && <Check className="w-4 h-4 text-forest shrink-0" aria-label="Verified specialist" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-espresso/60">
                          <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-mustard" /> {s.average_rating?.toFixed(1) ?? '—'}</span>
                          {!!s.years_experience && <span className="inline-flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> {s.years_experience}y</span>}
                        </div>
                      </div>
                    </div>

                    {s.bio && <p className="text-sm text-espresso/70 mt-3 line-clamp-2">{s.bio}</p>}

                    <div className="mt-2">
                      <TagPill tone={s.verified_specialist ? 'forest' : 'mustard'}>
                        {s.verified_specialist ? 'Verified specialist' : 'Specialist'}
                      </TagPill>
                    </div>

                    <div className="mt-4">
                      {open ? (
                        <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold border-2 border-forest/40 bg-forest/10 text-forest">
                          <Clock className="w-4 h-4" /> {s.my_booking_status === 'accepted' ? 'Accepted' : 'Request sent'}
                        </span>
                      ) : (
                        <button onClick={() => setBooking(s)} className="btn-kid-primary !py-2 !px-4 text-sm w-full justify-center">
                          Book this specialist
                        </button>
                      )}
                    </div>
                  </KidCard>
                );
              })}
            </div>
          ) : (
            <KidCard tone="cream" className="flex flex-col items-center text-center py-14">
              <Illustration name="mentor" size={170} />
              <h3 className="font-display text-2xl font-bold mt-2 text-espresso">No specialists yet</h3>
              <p className="text-sm text-espresso/70 mt-1 max-w-sm">
                We&apos;ll list {trackLabel(track)}-track specialists here as they join SkillHub.
              </p>
              <Link href={`/students/${track}/dashboard`} className="btn-kid-cream mt-5 !py-2 !px-4 text-sm">Back to dashboard</Link>
            </KidCard>
          )}
        </main>
      </div>

      {booking && (
        <BookingModal specialist={booking} onClose={() => setBooking(null)} onConfirm={confirmBooking} busy={busy} />
      )}
    </div>
  );
}
