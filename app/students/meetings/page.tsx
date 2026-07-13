'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import {
  Video,
  Calendar,
  Clock,
  Users,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  LogIn
} from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  meeting_type: string;
  host_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  actual_end?: string;
  status: string;
  room_id: string;
  max_participants: number;
  current_participant_count: number;
  video_enabled: boolean;
  audio_enabled: boolean;
  screen_share_enabled: boolean;
  chat_enabled: boolean;
  recording_enabled: boolean;
  captions_enabled: boolean;
  created_at: string;
}

const StudentMeetingsPage = () => {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [joinInput, setJoinInput] = useState('');

  const handleJoinByLink = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinInput.trim();
    if (!raw) return;
    let roomId = raw;
    try {
      const url = new URL(raw);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) roomId = segments[segments.length - 1];
    } catch {
    }
    if (!roomId) return;
    router.push(`/students/meeting-room/${encodeURIComponent(roomId)}`);
  };

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
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

    fetchMeetings();
  }, [router, currentUser?.role]);

  const fetchMeetings = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMeetings(Array.isArray(data) ? data : []);
      } else {
        throw new Error('Failed to fetch meetings');
      }
    } catch (err: any) {
      console.error('Error fetching meetings:', err);
      setError(err.message || 'Failed to load meetings');
      setMeetings([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinMeeting = async (meeting: Meeting) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${meeting.room_id}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'participant' })
      });

      if (response.ok) {
        router.push(`/students/meeting-room/${meeting.room_id}`);
      } else {
        throw new Error('Failed to join meeting');
      }
    } catch (err: any) {
      console.error('Error joining meeting:', err);
      alert(`Failed to join meeting: ${err.message}`);
    }
  };

  const filteredMeetings = meetings.filter(meeting => {
    const matchesSearch = meeting.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         meeting.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = statusFilter === 'all' || meeting.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-coral/15 text-coral border-red-300';
      case 'scheduled': return 'bg-terracotta/15 text-terracotta-500 border-blue-300';
      case 'starting': return 'bg-mustard/20 text-mustard-500 border-yellow-300';
      case 'ended': return 'bg-cream-100 text-espresso border-espresso/20';
      default: return 'bg-cream-100 text-espresso border-espresso/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'live': return <Play className="w-4 h-4 text-coral" />;
      case 'scheduled': return <Clock className="w-4 h-4 text-terracotta" />;
      case 'starting': return <AlertCircle className="w-4 h-4 text-mustard-500" />;
      case 'ended': return <CheckCircle className="w-4 h-4 text-espresso/70" />;
      default: return <XCircle className="w-4 h-4 text-espresso/70" />;
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      
      <div className="flex pt-16">
        <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
        
        <main className="flex-1 transition-all duration-300 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex justify-between items-center mb-8">
              <div>
                <PageHeader title="Your" accent="meetings" />
                <p className="text-espresso/70 mt-1">Join live sessions and view your scheduled meetings</p>
              </div>
              <button
                onClick={fetchMeetings}
                className="flex items-center inline-flex items-center gap-2 px-4 py-2 bg-terracotta text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>

            {}
            <form
              onSubmit={handleJoinByLink}
              className="bg-cream-50 rounded-2xl p-5 border-2 border-espresso/10 shadow-kid mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
            >
              <LogIn className="w-5 h-5 text-terracotta flex-shrink-0 hidden sm:block" />
              <div className="flex-1">
                <label htmlFor="join-input" className="block text-xs font-semibold uppercase tracking-wide text-espresso/55 mb-1">
                  Got an invite link?
                </label>
                <input
                  id="join-input"
                  type="text"
                  placeholder="Paste your invite link or meeting code"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                />
              </div>
              <button
                type="submit"
                disabled={!joinInput.trim()}
                className="btn-kid-primary disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm self-stretch sm:self-auto"
              >
                Join
              </button>
            </form>

            {}
            <div className="bg-cream-50 rounded-lg p-6 shadow-sm mb-8">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search meetings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="all">All Status</option>
                  <option value="live">Live Now</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="starting">Starting Soon</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
            </div>

            {}
            <div className="space-y-6">
              {isLoading ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-espresso/70">Loading meetings...</p>
                </div>
              ) : error ? (
                <div className="text-center py-10">
                  <div className="bg-coral/10 border border-coral/30 rounded-lg p-6 max-w-md mx-auto">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-coral mb-2">Unable to Load Meetings</h3>
                    <p className="text-coral mb-4">{error}</p>
                    <button 
                      onClick={fetchMeetings}
                      className="bg-coral text-white px-4 py-2 rounded-lg hover:bg-coral-400 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : filteredMeetings.length === 0 ? (
                <div className="text-center py-10">
                  <Video className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-espresso mb-2">No Meetings Found</h3>
                  <p className="text-espresso/70">You don't have any meetings scheduled yet.</p>
                </div>
              ) : (
                filteredMeetings.map((meeting, index) => (
                  <motion.div
                    key={meeting.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid hover:shadow-kid-lg hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <h3 className="text-xl font-semibold text-espresso mr-3">
                            {meeting.title}
                          </h3>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getStatusColor(meeting.status)}`}>
                            {getStatusIcon(meeting.status)}
                            <span className="ml-2 capitalize">{meeting.status}</span>
                          </span>
                        </div>
                        
                        {meeting.description && (
                          <p className="text-espresso/70 mb-4">{meeting.description}</p>
                        )}
                        
                        <div className="flex items-center flex-wrap gap-4 text-sm text-espresso/55">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {formatDateTime(meeting.scheduled_start)}
                          </div>
                          <div className="flex items-center">
                            <Users className="w-4 h-4 mr-1" />
                            {meeting.current_participant_count}/{meeting.max_participants} participants
                          </div>
                          <div className="flex items-center">
                            <Video className="w-4 h-4 mr-1" />
                            {meeting.meeting_type.replace('_', ' ')}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-4 flex-wrap">
                          {meeting.video_enabled && (
                            <span className="px-2 py-1 bg-terracotta/10 text-terracotta-500 text-xs rounded">Video</span>
                          )}
                          {meeting.audio_enabled && (
                            <span className="px-2 py-1 bg-forest/10 text-forest-500 text-xs rounded">Audio</span>
                          )}
                          {meeting.screen_share_enabled && (
                            <span className="px-2 py-1 bg-coral/10 text-coral text-xs rounded">Screen Share</span>
                          )}
                          {meeting.chat_enabled && (
                            <span className="px-2 py-1 bg-mustard/15 text-mustard-500 text-xs rounded">Chat</span>
                          )}
                          {meeting.recording_enabled && (
                            <span className="px-2 py-1 bg-coral/10 text-coral text-xs rounded">Recording</span>
                          )}
                          {meeting.captions_enabled && (
                            <span className="px-2 py-1 bg-terracotta/10 text-terracotta-500 text-xs rounded">Captions</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        {(meeting.status === 'live' || meeting.status === 'starting') && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleJoinMeeting(meeting)}
                            className="flex items-center inline-flex items-center gap-2 px-6 py-3 bg-forest text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold shadow-lg"
                          >
                            <Video className="w-5 h-5 mr-2" />
                            Join Meeting
                          </motion.button>
                        )}
                        {meeting.status === 'scheduled' && (
                          <button
                            disabled
                            className="px-6 py-3 bg-cream-300 text-espresso/70 rounded-lg cursor-not-allowed"
                          >
                            Not Started
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Total Meetings</h3>
                <div className="text-3xl font-bold text-terracotta">{meetings.length}</div>
                <p className="text-espresso/70">All time</p>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Live Now</h3>
                <div className="text-3xl font-bold text-coral">
                  {meetings.filter(m => m.status === 'live').length}
                </div>
                <p className="text-espresso/70">Active sessions</p>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Upcoming</h3>
                <div className="text-3xl font-bold text-forest">
                  {meetings.filter(m => m.status === 'scheduled').length}
                </div>
                <p className="text-espresso/70">Scheduled</p>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default StudentMeetingsPage;
