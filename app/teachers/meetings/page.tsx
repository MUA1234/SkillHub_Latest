'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  Edit,
  Trash2,
  Play,
  Square,
  Search,
  Filter,
  RefreshCw,
  Settings,
  BarChart3,
  Link as LinkIcon,
  Check,
  X
} from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  meeting_type: string;
  host_id: string;
  scheduled_start: string;
  scheduled_end: string;
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
}

const TeacherMeetingsPage = () => {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string; scheduled_start: string; scheduled_end: string; max_participants: number } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const toLocalInput = (iso: string): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso.slice(0, 16);
    }
  };

  const openEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setEditDraft({
      title: meeting.title || '',
      description: meeting.description || '',
      scheduled_start: toLocalInput(meeting.scheduled_start),
      scheduled_end: toLocalInput(meeting.scheduled_end),
      max_participants: meeting.max_participants || 50,
    });
  };

  const submitEditMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeeting || !editDraft) return;
    setEditSaving(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${editingMeeting.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: editDraft.title,
            description: editDraft.description,
            scheduled_start: new Date(editDraft.scheduled_start).toISOString(),
            scheduled_end: new Date(editDraft.scheduled_end).toISOString(),
            max_participants: Number(editDraft.max_participants),
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update meeting');
      }
      setEditingMeeting(null);
      setEditDraft(null);
      fetchMeetings();
    } catch (err: any) {
      alert(err?.message || 'Could not save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleCopyInviteLink = (meeting: Meeting) => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/students/meeting-room/${meeting.room_id}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopiedRoomId(meeting.room_id);
        setTimeout(() => setCopiedRoomId(null), 2500);
      },
      () => {
        window.prompt('Copy this invite link for your students:', url);
      },
    );
  };

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Teacher'}`.trim();
  const userEmail = currentUser?.email || 'demo@teacher.com';

  const [newMeeting, setNewMeeting] = useState({
    title: '',
    description: '',
    meeting_type: 'one_on_one_tutoring',
    scheduled_start: '',
    scheduled_end: '',
    max_participants: 50,
    video_enabled: true,
    audio_enabled: true,
    screen_share_enabled: true,
    chat_enabled: true,
    recording_enabled: false,
    captions_enabled: false
  });

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'teacher') {
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
        const teacherMeetings = Array.isArray(data) 
          ? data.filter((m: Meeting) => m.host_id === currentUser?.id)
          : [];
        setMeetings(teacherMeetings);
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

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMeeting.title || !newMeeting.scheduled_start || !newMeeting.scheduled_end) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newMeeting)
      });

      if (response.ok) {
        alert('Meeting created successfully!');
        setIsCreateModalOpen(false);
        setNewMeeting({
          title: '',
          description: '',
          meeting_type: 'one_on_one_tutoring',
          scheduled_start: '',
          scheduled_end: '',
          max_participants: 50,
          video_enabled: true,
          audio_enabled: true,
          screen_share_enabled: true,
          chat_enabled: true,
          recording_enabled: false,
          captions_enabled: false
        });
        fetchMeetings();
      } else {
        throw new Error('Failed to create meeting');
      }
    } catch (err: any) {
      console.error('Error creating meeting:', err);
      alert(`Failed to create meeting: ${err.message}`);
    }
  };

  const handleStartMeeting = async (meeting: Meeting) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${meeting.id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_status: 'live' })
      });

      if (response.ok) {
        router.push(`/teachers/meeting-room/${meeting.room_id}`);
      } else {
        throw new Error('Failed to start meeting');
      }
    } catch (err: any) {
      console.error('Error starting meeting:', err);
      alert(`Failed to start meeting: ${err.message}`);
    }
  };

  const handleEndMeeting = async (meeting: Meeting) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${meeting.id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_status: 'ended' })
      });

      if (response.ok) {
        fetchMeetings();
      } else {
        throw new Error('Failed to end meeting');
      }
    } catch (err: any) {
      console.error('Error ending meeting:', err);
      alert(`Failed to end meeting: ${err.message}`);
    }
  };

  const handleDeleteMeeting = async (meeting: Meeting) => {
    if (!confirm(`Are you sure you want to delete "${meeting.title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${meeting.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (response.ok) {
        alert('Meeting deleted successfully!');
        fetchMeetings();
      } else {
        throw new Error('Failed to delete meeting');
      }
    } catch (err: any) {
      console.error('Error deleting meeting:', err);
      alert(`Failed to delete meeting: ${err.message}`);
    }
  };

  const filteredMeetings = meetings.filter(meeting => {
    const matchesSearch = meeting.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         meeting.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = statusFilter === 'all' || meeting.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

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
                <PageHeader title="Your" accent="meeting rooms" />
                <p className="text-espresso/70 mt-1">Create and manage your live teaching sessions</p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={fetchMeetings}
                  className="flex items-center px-4 py-2 bg-espresso/85 text-white rounded-lg hover:bg-espresso transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </button>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center inline-flex items-center gap-2 px-6 py-3 bg-terracotta text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Meeting
                </button>
              </div>
            </div>

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
                  <p className="text-espresso/70 mb-4">Create your first meeting to get started!</p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-terracotta text-white px-6 py-3 rounded-lg hover:bg-terracotta-500 transition-colors"
                  >
                    Create Meeting
                  </button>
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
                          <span className={`px-3 py-1 rounded-full text-sm ${
                            meeting.status === 'live' ? 'bg-coral/15 text-coral' :
                            meeting.status === 'scheduled' ? 'bg-terracotta/15 text-terracotta-500' :
                            'bg-cream-100 text-espresso'
                          }`}>
                            {meeting.status}
                          </span>
                        </div>
                        
                        {meeting.description && (
                          <p className="text-espresso/70 mb-4">{meeting.description}</p>
                        )}
                        
                        <div className="flex items-center flex-wrap gap-4 text-sm text-espresso/55 mb-4">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {formatDateTime(meeting.scheduled_start)}
                          </div>
                          <div className="flex items-center">
                            <Users className="w-4 h-4 mr-1" />
                            {meeting.current_participant_count}/{meeting.max_participants} participants
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {meeting.status === 'live' && (
                            <>
                              <button
                                onClick={() => router.push(`/teachers/meeting-room/${meeting.room_id}`)}
                                className="flex items-center inline-flex items-center gap-2 px-4 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                              >
                                <Video className="w-4 h-4 mr-2" />
                                Join Live
                              </button>
                              <button
                                onClick={() => handleEndMeeting(meeting)}
                                className="flex items-center px-4 py-2 bg-espresso/85 text-white rounded-lg hover:bg-espresso transition-colors"
                              >
                                <Square className="w-4 h-4 mr-2" />
                                End Session
                              </button>
                            </>
                          )}
                          {meeting.status === 'scheduled' && (
                            <button
                              onClick={() => handleStartMeeting(meeting)}
                              className="flex items-center inline-flex items-center gap-2 px-4 py-2 bg-forest text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Start Meeting
                            </button>
                          )}
                          {meeting.status !== 'ended' && (
                            <button
                              type="button"
                              onClick={() => handleCopyInviteLink(meeting)}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-cream-50 text-espresso border-2 border-espresso/15 rounded-full hover:border-espresso/40 font-semibold transition-colors"
                              title="Copy invite link for students"
                            >
                              {copiedRoomId === meeting.room_id ? (
                                <>
                                  <Check className="w-4 h-4 text-forest" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <LinkIcon className="w-4 h-4" />
                                  Invite link
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => openEditMeeting(meeting)}
                          className="p-2 text-espresso/45 hover:text-terracotta transition-colors"
                          title="Edit meeting"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMeeting(meeting)}
                          className="p-2 text-espresso/45 hover:text-coral transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Total Meetings</h3>
                <div className="text-3xl font-bold text-terracotta">{meetings.length}</div>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Live Now</h3>
                <div className="text-3xl font-bold text-coral">
                  {meetings.filter(m => m.status === 'live').length}
                </div>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Scheduled</h3>
                <div className="text-3xl font-bold text-forest">
                  {meetings.filter(m => m.status === 'scheduled').length}
                </div>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Completed</h3>
                <div className="text-3xl font-bold text-espresso/70">
                  {meetings.filter(m => m.status === 'ended').length}
                </div>
              </div>
            </div>
          </motion.div>
        </main>
      </div>

      {}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-espresso">Create New Meeting</h2>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleCreateMeeting}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Meeting Title *
                    </label>
                    <input
                      type="text"
                      value={newMeeting.title}
                      onChange={(e) => setNewMeeting({...newMeeting, title: e.target.value})}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="e.g., Advanced Mathematics Session"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Description
                    </label>
                    <textarea
                      value={newMeeting.description}
                      onChange={(e) => setNewMeeting({...newMeeting, description: e.target.value})}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      rows={3}
                      placeholder="Describe what will be covered..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-1">
                        Start Date & Time *
                      </label>
                      <input
                        type="datetime-local"
                        value={newMeeting.scheduled_start}
                        onChange={(e) => setNewMeeting({...newMeeting, scheduled_start: e.target.value})}
                        className="w-full p-3 border border-espresso/20 rounded-lg"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-espresso mb-1">
                        End Date & Time *
                      </label>
                      <input
                        type="datetime-local"
                        value={newMeeting.scheduled_end}
                        onChange={(e) => setNewMeeting({...newMeeting, scheduled_end: e.target.value})}
                        className="w-full p-3 border border-espresso/20 rounded-lg"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-1">
                        Meeting Type
                      </label>
                      <select
                        value={newMeeting.meeting_type}
                        onChange={(e) => setNewMeeting({...newMeeting, meeting_type: e.target.value})}
                        className="w-full p-3 border border-espresso/20 rounded-lg"
                      >
                        <option value="one_on_one_tutoring">One-on-One Tutoring</option>
                        <option value="group_class">Group Class</option>
                        <option value="teacher_sponsor_meeting">Teacher-Sponsor Meeting</option>
                        <option value="assessment">Assessment</option>
                        <option value="consultation">Consultation</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-espresso mb-1">
                        Max Participants
                      </label>
                      <input
                        type="number"
                        value={newMeeting.max_participants}
                        onChange={(e) => setNewMeeting({...newMeeting, max_participants: parseInt(e.target.value)})}
                        className="w-full p-3 border border-espresso/20 rounded-lg"
                        min="1"
                        max="100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-espresso">Features</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMeeting.video_enabled}
                          onChange={(e) => setNewMeeting({...newMeeting, video_enabled: e.target.checked})}
                          className="rounded"
                        />
                        <span>Video</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMeeting.audio_enabled}
                          onChange={(e) => setNewMeeting({...newMeeting, audio_enabled: e.target.checked})}
                          className="rounded"
                        />
                        <span>Audio</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMeeting.screen_share_enabled}
                          onChange={(e) => setNewMeeting({...newMeeting, screen_share_enabled: e.target.checked})}
                          className="rounded"
                        />
                        <span>Screen Share</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMeeting.chat_enabled}
                          onChange={(e) => setNewMeeting({...newMeeting, chat_enabled: e.target.checked})}
                          className="rounded"
                        />
                        <span>Chat</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMeeting.recording_enabled}
                          onChange={(e) => setNewMeeting({...newMeeting, recording_enabled: e.target.checked})}
                          className="rounded"
                        />
                        <span>Recording</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMeeting.captions_enabled}
                          onChange={(e) => setNewMeeting({...newMeeting, captions_enabled: e.target.checked})}
                          className="rounded"
                        />
                        <span>Captions</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-6 py-3 text-espresso bg-cream-100 rounded-lg hover:bg-cream-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-terracotta text-white rounded-lg hover:bg-terracotta-500"
                  >
                    Create Meeting
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {editingMeeting && editDraft && (
        <div className="fixed inset-0 bg-espresso/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl border-2 border-espresso shadow-kid-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="bg-espresso text-cream px-6 py-4 rounded-t-3xl flex items-center justify-between">
              <h2 className="text-xl font-bold">Edit meeting</h2>
              <button
                type="button"
                onClick={() => { setEditingMeeting(null); setEditDraft(null); }}
                className="text-cream/65 hover:text-cream rounded-full p-1 hover:bg-cream/10"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitEditMeeting} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-espresso mb-1">Title</label>
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-espresso mb-1">Description</label>
                <textarea
                  value={editDraft.description}
                  onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-espresso mb-1">Starts</label>
                  <input
                    type="datetime-local"
                    value={editDraft.scheduled_start}
                    onChange={(e) => setEditDraft({ ...editDraft, scheduled_start: e.target.value })}
                    className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-espresso mb-1">Ends</label>
                  <input
                    type="datetime-local"
                    value={editDraft.scheduled_end}
                    onChange={(e) => setEditDraft({ ...editDraft, scheduled_end: e.target.value })}
                    className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-espresso mb-1">Max participants</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={editDraft.max_participants}
                  onChange={(e) => setEditDraft({ ...editDraft, max_participants: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t-2 border-espresso/10">
                <button
                  type="button"
                  onClick={() => { setEditingMeeting(null); setEditDraft(null); }}
                  className="btn-kid-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn-kid-primary disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherMeetingsPage;
