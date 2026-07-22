'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { StatPill } from '@/components/ui/stat-pill';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { 
  Play, 
  Calendar, 
  Clock, 
  Users, 
  Video,
  Search,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle,
  Star,
  Filter,
  RefreshCw
} from 'lucide-react';

interface LiveSession {
  id: string;
  teacher_id?: string;
  teacher_name?: string;
  teacher_avatar?: string | null;
  course_title?: string | null;
  title: string;
  description?: string;
  subject?: string;
  grade_level?: string;
  session_type?: string;
  meeting_link?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  max_participants?: number;
  current_participants: number;
  price?: number;
  currency?: string;
  requires_payment: boolean;
  recording_enabled?: boolean;
  accessibility?: {
    target_disability_types?: string[];
    has_live_captions?: boolean;
    has_sign_language_interpreter?: boolean;
    accessibility_level?: number;
    relevance_score?: number | null;
  };
}

const StudentLiveSessionsPage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [activeTab, setActiveTab] = useState('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  
  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Student'}`.trim();
  const userEmail = currentUser?.email || 'demo@student.com';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }

    fetchSessions();
    fetchMyEnrollments();
  }, [router, currentUser?.role]);

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/students/live-sessions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const list =
          (data?.data?.sessions as any[]) ||
          (data?.sessions as any[]) ||
          [];
        setSessions(Array.isArray(list) ? list : []);
      } else {
        setSessions([]);
      }
    } catch (err: any) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMyEnrollments = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/enrollments/my-enrollments`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMyEnrollments(Array.isArray(data?.enrollments) ? data.enrollments : []);
      }
    } catch (err: any) {
      console.error('Error fetching enrollments:', err);
    }
  };

  const handleRequestEnrollment = async (sessionId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/enrollments/sessions/${sessionId}/enroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'I would like to join this session' })
      });

      if (response.ok) {
        alert('Enrollment request sent! The teacher will review your request.');
        fetchMyEnrollments();
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to send enrollment request');
      }
    } catch (err: any) {
      console.error('Error requesting enrollment:', err);
      alert('Failed to send enrollment request');
    }
  };

  const getEnrollmentStatus = (sessionId: string) => {
    return myEnrollments.find(e => e.session_id === sessionId);
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = 
      session.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch && session.status !== 'cancelled';
  });

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEnrollmentButton = (session: LiveSession) => {
    const enrollment = getEnrollmentStatus(session.id);
    
    if (!enrollment) {
      return (
        <button
          onClick={() => handleRequestEnrollment(session.id)}
          className="w-full bg-forest text-white py-3 font-semibold rounded-lg hover:bg-forest-400 transition-colors"
        >
          Request to Join
        </button>
      );
    }
    
    if (enrollment.status === 'pending') {
      return (
        <button
          disabled
          className="w-full bg-mustard/20 text-mustard-500 py-3 font-semibold rounded-lg cursor-not-allowed"
        >
          <Clock className="w-4 h-4 inline mr-2" />
          Pending Approval
        </button>
      );
    }
    
    if (enrollment.status === 'approved') {
      if (session.requires_payment && session.price && session.price > 0) {
        return (
          <button
            onClick={() => router.push(`/students/live-sessions/${session.id}/payment`)}
            className="w-full bg-terracotta text-white py-3 font-semibold rounded-lg hover:bg-terracotta-500 transition-colors"
          >
            <DollarSign className="w-4 h-4 inline mr-2" />
            Pay {formatCurrency(session.price, { currency: session.currency || 'LKR', locale: language })}
          </button>
        );
      } else {
        return (
          <button
            onClick={() => router.push(`/students/meeting-room/${session.id}`)}
            className="w-full bg-forest text-white py-3 font-semibold rounded-lg hover:bg-forest-400 transition-colors"
          >
            <Video className="w-4 h-4 inline mr-2" />
            Join Session
          </button>
        );
      }
    }
    
    if (enrollment.status === 'rejected') {
      return (
        <button
          disabled
          className="w-full bg-coral/15 text-coral py-3 font-semibold rounded-lg cursor-not-allowed"
        >
          <XCircle className="w-4 h-4 inline mr-2" />
          Request Rejected
        </button>
      );
    }
    
    return null;
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole="student" 
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole="student" />
      
      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <PageHeader
              eyebrow="Live now"
              title="Hop into a"
              accent="live class"
              body="Browse available sessions and join classes from top teachers."
              actions={
                <button
                  onClick={() => { fetchSessions(); fetchMyEnrollments(); }}
                  className="btn-kid-cream !py-2 !px-4 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              }
            />
          </motion.div>
          
          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="bg-cream-50 rounded-2xl p-4 border-2 border-espresso/10 shadow-kid">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by subject (e.g., Mathematics, Physics, Chemistry)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-cream-100 border-2 border-espresso/15 rounded-full text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                />
              </div>
            </div>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {isLoading ? (
              <KidCard tone="cream" className="!p-10 text-center text-sm text-espresso/55">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-terracotta"></div>
                <p className="mt-4">Loading sessions…</p>
              </KidCard>
            ) : error ? (
              <EmptyState
                illustration="server-error"
                title="Unable to load sessions"
                body={error}
                actions={<button onClick={() => { fetchSessions(); fetchMyEnrollments(); }} className="btn-kid-primary">Try again</button>}
              />
            ) : filteredSessions.length === 0 ? (
              <EmptyState
                illustration="empty-events"
                title="No sessions found"
                body={searchQuery ? `No sessions match "${searchQuery}"` : 'No sessions available right now — check back soon.'}
              />
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredSessions.map((session, index) => {
                  const tones: any[] = ['cream', 'mustard', 'cream', 'forest', 'cream', 'terracotta'];
                  const tilts: any[] = ['left', 'right', 'none', 'left', 'right', 'none'];
                  const tone = tones[index % tones.length];
                  const tilt = tilts[index % tilts.length];
                  const onDark = tone === 'forest' || tone === 'terracotta' || tone === 'espresso';
                  return (
                    <KidCard
                      key={session.id}
                      tone={tone}
                      tilt={tilt}
                      sticker
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSession(session)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedSession(session);
                        }
                      }}
                      className="cursor-pointer hover:-translate-y-1 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/50"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-display text-lg font-bold leading-tight line-clamp-2">
                          {session.title}
                        </h3>
                        {session.status === 'live' && (
                          <TagPill tone="terracotta" className="!bg-coral !text-cream !border-cream/20 animate-pulse">LIVE</TagPill>
                        )}
                      </div>

                      {session.teacher_name && (
                        <p className={`text-sm font-semibold mb-2 inline-flex items-center gap-1.5 ${onDark ? 'text-cream/90' : 'text-espresso/80'}`}>
                          <Star className="w-3.5 h-3.5" />
                          {session.teacher_name}
                        </p>
                      )}

                      {session.description && (
                        <p className={`text-sm mb-3 line-clamp-2 ${onDark ? 'opacity-80' : 'text-espresso/70'}`}>
                          {session.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {session.subject && <TagPill tone={onDark ? 'cream' : 'terracotta'}>{session.subject}</TagPill>}
                        {session.grade_level && <TagPill tone={onDark ? 'cream' : 'mustard'}>{session.grade_level}</TagPill>}
                        {session.recording_enabled && <TagPill tone={onDark ? 'cream' : 'forest'}>📹 Recording</TagPill>}
                      </div>

                      <div className={`flex items-center flex-wrap gap-3 mb-4 text-xs font-semibold ${onDark ? 'text-cream/80' : 'text-espresso/65'}`}>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDateTime(session.scheduled_start)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {session.current_participants}/{session.max_participants || 'N/A'}
                        </span>
                      </div>

                      {session.requires_payment && session.price && session.price > 0 && (
                        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-xl ${onDark ? 'bg-cream/15 text-cream' : 'bg-mustard/20 text-espresso'} border-2 ${onDark ? 'border-cream/20' : 'border-mustard/40'}`}>
                          <DollarSign className="w-4 h-4" />
                          <span className="text-sm font-bold">
                            {formatCurrency(session.price, { currency: session.currency || 'LKR', locale: language })}
                          </span>
                        </div>
                      )}

                      <div onClick={(e) => e.stopPropagation()}>
                        {getEnrollmentButton(session)}
                      </div>
                    </KidCard>
                  );
                })}
              </div>
            )}
          </motion.div>
          
          {}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <StatPill onDark={false} tone="mustard"    badge="A" value={myEnrollments.filter(e => e.status === 'pending').length}  label="Pending requests" />
            <StatPill onDark={false} tone="forest"     badge="B" value={myEnrollments.filter(e => e.status === 'approved').length} label="Approved" />
            <StatPill onDark={false} tone="terracotta" badge="C" value={sessions.length}                                            label="Total sessions" />
          </div>
        </div>
      </div>

      {}
      {selectedSession && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-espresso/50 backdrop-blur-sm"
          onClick={() => setSelectedSession(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-cream-50 rounded-3xl border-2 border-espresso/10 shadow-kid w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {selectedSession.status === 'live' && (
                      <TagPill tone="terracotta" className="!bg-coral !text-cream !border-cream/20 animate-pulse">LIVE</TagPill>
                    )}
                    <TagPill tone="mustard">{selectedSession.status}</TagPill>
                  </div>
                  <h2 className="font-display text-2xl font-bold text-espresso leading-tight">
                    {selectedSession.title}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  aria-label="Close"
                  className="shrink-0 w-9 h-9 rounded-full bg-espresso/10 hover:bg-espresso/20 flex items-center justify-center text-espresso transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-2xl bg-cream-100 border-2 border-espresso/10">
                {selectedSession.teacher_avatar ? (
                  <img src={selectedSession.teacher_avatar} alt={selectedSession.teacher_name || 'Teacher'} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-forest text-cream flex items-center justify-center font-bold text-lg">
                    {(selectedSession.teacher_name || 'T').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-espresso/55 uppercase tracking-wide">Taught by</p>
                  <p className="font-display text-lg font-bold text-espresso">{selectedSession.teacher_name || 'Unknown Teacher'}</p>
                </div>
              </div>

              {selectedSession.description && (
                <p className="text-sm text-espresso/75 mb-5 leading-relaxed">{selectedSession.description}</p>
              )}

              <div className="flex flex-wrap gap-2 mb-5">
                {selectedSession.course_title && <TagPill tone="terracotta">{selectedSession.course_title}</TagPill>}
                {selectedSession.session_type && <TagPill tone="forest">{selectedSession.session_type.replace(/_/g, ' ')}</TagPill>}
                {selectedSession.accessibility?.has_live_captions && <TagPill tone="mustard">📝 Live captions</TagPill>}
                {selectedSession.accessibility?.has_sign_language_interpreter && <TagPill tone="mustard">🤟 Sign language</TagPill>}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-2xl bg-cream-100 border-2 border-espresso/10">
                  <p className="text-xs font-semibold text-espresso/55 flex items-center gap-1 mb-1"><Calendar className="w-3.5 h-3.5" /> Starts</p>
                  <p className="text-sm font-bold text-espresso">{formatDateTime(selectedSession.scheduled_start)}</p>
                </div>
                <div className="p-3 rounded-2xl bg-cream-100 border-2 border-espresso/10">
                  <p className="text-xs font-semibold text-espresso/55 flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5" /> Ends</p>
                  <p className="text-sm font-bold text-espresso">{formatDateTime(selectedSession.scheduled_end)}</p>
                </div>
                <div className="p-3 rounded-2xl bg-cream-100 border-2 border-espresso/10">
                  <p className="text-xs font-semibold text-espresso/55 flex items-center gap-1 mb-1"><Users className="w-3.5 h-3.5" /> Seats</p>
                  <p className="text-sm font-bold text-espresso">{selectedSession.current_participants}/{selectedSession.max_participants || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-2xl bg-cream-100 border-2 border-espresso/10">
                  <p className="text-xs font-semibold text-espresso/55 flex items-center gap-1 mb-1"><DollarSign className="w-3.5 h-3.5" /> Price</p>
                  <p className="text-sm font-bold text-espresso">
                    {selectedSession.requires_payment && selectedSession.price && selectedSession.price > 0
                      ? formatCurrency(selectedSession.price, { currency: selectedSession.currency || 'LKR', locale: language })
                      : 'Free'}
                  </p>
                </div>
              </div>

              <div onClick={(e) => e.stopPropagation()}>
                {getEnrollmentButton(selectedSession)}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default StudentLiveSessionsPage;