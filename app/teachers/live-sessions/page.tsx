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
  User,
  Play,
  Pause,
  Square,
  Settings,
  Share,
  MessageSquare,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Monitor,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  X,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  BarChart3,
  CheckCircle,
  XCircle,
  AlertCircle,
  PlayCircle,
  Accessibility,
  Subtitles,
  Eye,
  Ear,
  Brain
} from 'lucide-react';

interface LiveSession {
  id: string;
  teacher_id: string;
  course_id?: string;
  title: string;
  description?: string;
  session_type: string;
  session_mode: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  actual_end?: string;
  status: string;
  meeting_link?: string;
  location?: string;
  max_participants?: number;
  current_participants: number;
  recording_enabled: boolean;
  recording_url?: string;
  recording_expires_at?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  created_at: string;
  course?: {
    title: string;
    level?: string;
    subject?: {
      name: string;
    };
  };
}

interface SessionsData {
  sessions: LiveSession[];
  total_count: number;
  upcoming_count: number;
  live_count: number;
  completed_count: number;
}

const TeacherLiveSessionsPage = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionFilter, setSessionFilter] = useState('all');
  
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [isEditSessionModalOpen, setIsEditSessionModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  
  const [currentSession, setCurrentSession] = useState<LiveSession | null>(null);
  const [sessionParticipants, setSessionParticipants] = useState<any[]>([]);
  const [sessionAnalytics, setSessionAnalytics] = useState<any>(null);
  
  const [newSessionData, setNewSessionData] = useState({
    title: '',
    subject: '',
    grade: '',
    date: '',
    time: '',
    duration: '60',
    description: '',
    maxParticipants: 30,
    recordingEnabled: true,
    isRecurring: false,
    price: '0',
    requiresPayment: false
  });

  const [targetDisabilities, setTargetDisabilities] = useState<string[]>([]);
  const [accessibleForAll, setAccessibleForAll] = useState(true);
  const [hasLiveCaptions, setHasLiveCaptions] = useState(false);
  const [hasSignLanguage, setHasSignLanguage] = useState(false);
  const [accessibilityLevel, setAccessibilityLevel] = useState(3);

  const [sessionsData, setSessionsData] = useState<SessionsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Teacher'}`.trim();
  const userEmail = currentUser?.email || 'demo@teacher.com';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'teacher') {
      router.push('/auth');
      return;
    }

    fetchSessionsData();
  }, [router, currentUser?.role]);

  const fetchSessionsData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      
      const response = await apiClient.getTeacherSessions();
      setSessionsData({
        sessions: Array.isArray(response?.sessions) ? response.sessions : [],
        total_count: response?.total_count || 0,
        upcoming_count: response?.upcoming_count || 0,
        live_count: response?.live_count || 0,
        completed_count: response?.completed_count || 0
      });
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Error fetching sessions:', err);
      setError(err.message || 'Failed to load sessions data');
      
      setSessionsData({
        sessions: [],
        total_count: 0,
        upcoming_count: 0,
        live_count: 0,
        completed_count: 0
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  

  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewSessionData(prev => ({ ...prev, [name]: value }));
  };

  const toggleDisability = (type: string) => {
    setTargetDisabilities(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
    
    if (!targetDisabilities.includes(type)) {
      setAccessibleForAll(false);
    }
  };

  const disabilityTypes = [
    { id: 'dyslexia', name: 'Dyslexia', icon: '📚' },
    { id: 'adhd', name: 'ADHD', icon: '🧠' },
    { id: 'asd', name: 'Autism', icon: '🔷' },
    { id: 'hearing_impairment_deaf', name: 'Deaf', icon: '🦻' },
    { id: 'hearing_impairment_hard_of_hearing', name: 'Hard of Hearing', icon: '👂' },
    { id: 'visual_impairment_blind', name: 'Blind', icon: '👁️' },
    { id: 'visual_impairment_low_vision', name: 'Low Vision', icon: '👓' },
    { id: 'dysgraphia', name: 'Dysgraphia', icon: '✍️' },
    { id: 'dyscalculia', name: 'Dyscalculia', icon: '🔢' },
    { id: 'physical_disability_mobility', name: 'Mobility Issues', icon: '♿' },
  ];

  const [editSessionData, setEditSessionData] = useState({
    title: '',
    description: '',
    session_type: '',
    session_mode: '',
    scheduled_start: '',
    scheduled_end: '',
    meeting_link: '',
    location: '',
    max_participants: 30,
    recording_enabled: true,
    is_recurring: false,
    recurrence_pattern: ''
  });

  const [recordingData, setRecordingData] = useState({
    recording_url: '',
    recording_expires_at: ''
  });

  const [createSessionLoading, setCreateSessionLoading] = useState(false);
  const [editSessionLoading, setEditSessionLoading] = useState(false);
  const [deleteSessionLoading, setDeleteSessionLoading] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newSessionData.title.trim() || !newSessionData.date || !newSessionData.time) {
      alert('Please add a title, date, and time.');
      return;
    }

    try {
      setCreateSessionLoading(true);
      
      const scheduledStart = new Date(`${newSessionData.date}T${newSessionData.time}`);
      const scheduledEnd = new Date(scheduledStart.getTime() + parseInt(newSessionData.duration) * 60000);
      
      if (isNaN(scheduledStart.getTime()) || isNaN(scheduledEnd.getTime())) {
        alert('Invalid date or time format');
        return;
      }

      if (!isAuthenticated()) {
        alert('You must be logged in to create a session. Please log in again.');
        router.push('/auth');
        return;
      }

      const sessionPayload = {
        title: newSessionData.title.trim(),
        description: newSessionData.description.trim() || null,
        session_type: 'live_session',
        session_mode: 'online',
        scheduled_start: scheduledStart.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        max_participants: newSessionData.maxParticipants,
        recording_enabled: newSessionData.recordingEnabled,
        is_recurring: newSessionData.isRecurring,
        meeting_link: null,
        location: newSessionData.grade || null,
        course_id: null,
        subject: newSessionData.subject || 'General',
        grade_level: newSessionData.grade || null,
        price: parseFloat(newSessionData.price) || 0,
        currency: 'USD',
        requires_payment: newSessionData.requiresPayment,
        target_disability_types: accessibleForAll ? [] : targetDisabilities,
        has_live_captions: hasLiveCaptions,
        has_sign_language_interpreter: hasSignLanguage,
        accessibility_level: accessibilityLevel
      };

      console.log('Creating session with payload:', sessionPayload);
      
      const result = await apiClient.createTeacherSession(sessionPayload);
      
      console.log('Session creation result:', result);
      
      alert(`Session \"${newSessionData.title}\" created successfully!`);
      setIsNewSessionModalOpen(false);
      setNewSessionData({
        title: '',
        subject: '',
        grade: '',
        date: '',
        time: '',
        duration: '60',
        description: '',
        maxParticipants: 30,
        recordingEnabled: true,
        isRecurring: false,
        price: '0',
        requiresPayment: false
      });
      setTargetDisabilities([]);
      setAccessibleForAll(true);
      setHasLiveCaptions(false);
      setHasSignLanguage(false);
      setAccessibilityLevel(3);
      
      await fetchSessionsData();
    } catch (err: any) {
      console.error('Detailed error creating session:', {
        error: err,
        message: err?.message,
        response: err?.response,
        status: err?.status
      });
      
      let errorMessage = 'Failed to create session';
      
      if (err?.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err?.message) {
        if (err.message.includes('Failed to fetch')) {
          errorMessage = 'Cannot connect to server. Please check if you are logged in and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      
      alert(`Failed to create session: ${errorMessage}`);
    } finally {
      setCreateSessionLoading(false);
    }
  };

  const handleEditSession = (session: LiveSession) => {
    setCurrentSession(session);
    setEditSessionData({
      title: session.title,
      description: session.description || '',
      session_type: session.session_type,
      session_mode: session.session_mode,
      scheduled_start: new Date(session.scheduled_start).toISOString().slice(0, 16),
      scheduled_end: new Date(session.scheduled_end).toISOString().slice(0, 16),
      meeting_link: session.meeting_link || '',
      location: session.location || '',
      max_participants: session.max_participants || 30,
      recording_enabled: session.recording_enabled,
      is_recurring: session.is_recurring,
      recurrence_pattern: session.recurrence_pattern || ''
    });
    setIsEditSessionModalOpen(true);
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentSession) return;

    try {
      setEditSessionLoading(true);
      
      const updatePayload = {
        title: editSessionData.title,
        description: editSessionData.description,
        session_type: editSessionData.session_type,
        session_mode: editSessionData.session_mode,
        scheduled_start: new Date(editSessionData.scheduled_start).toISOString(),
        scheduled_end: new Date(editSessionData.scheduled_end).toISOString(),
        meeting_link: editSessionData.meeting_link,
        location: editSessionData.location,
        max_participants: editSessionData.max_participants,
        recording_enabled: editSessionData.recording_enabled,
        is_recurring: editSessionData.is_recurring,
        recurrence_pattern: editSessionData.recurrence_pattern
      };

      await apiClient.updateTeacherSession(currentSession.id, updatePayload);
      
      alert('Session updated successfully!');
      setIsEditSessionModalOpen(false);
      setCurrentSession(null);
      await fetchSessionsData();
    } catch (err: any) {
      console.error('Error updating session:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to update session: ${errorMessage}`);
    } finally {
      setEditSessionLoading(false);
    }
  };

  const handleStatusUpdate = async (sessionId: string, newStatus: string) => {
    try {
      await apiClient.updateSessionStatus(sessionId, newStatus);
      alert(`Session status updated to ${newStatus}`);
      await fetchSessionsData();
    } catch (err: any) {
      console.error('Error updating session status:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to update status: ${errorMessage}`);
    }
  };

  const handleDeleteSession = async (session: LiveSession) => {
    if (!confirm(`Are you sure you want to delete "${session.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeleteSessionLoading(true);
      await apiClient.deleteTeacherSession(session.id);
      alert('Session deleted successfully!');
      await fetchSessionsData();
    } catch (err: any) {
      console.error('Error deleting session:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to delete session: ${errorMessage}`);
    } finally {
      setDeleteSessionLoading(false);
    }
  };

  const fetchSessionParticipants = async (sessionId: string) => {
    try {
      setParticipantsLoading(true);
      const response = await apiClient.getSessionParticipants(sessionId);
      setSessionParticipants(response.participants || []);
    } catch (err: any) {
      console.error('Error fetching participants:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to load participants: ${errorMessage}`);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleViewParticipants = (session: LiveSession) => {
    setCurrentSession(session);
    setIsParticipantsModalOpen(true);
    fetchSessionParticipants(session.id);
  };

  const removeSessionParticipant = async (studentId: string) => {
    if (!currentSession) return;
    
    try {
      await apiClient.removeSessionParticipant(currentSession.id, studentId);
      setSessionParticipants(prev => 
        prev.filter(participant => participant.student?.id !== studentId)
      );
      alert('Participant removed successfully');
    } catch (err: any) {
      console.error('Error removing participant:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to remove participant: ${errorMessage}`);
    }
  };

  const fetchSessionAnalytics = async (sessionId: string) => {
    try {
      setAnalyticsLoading(true);
      const response = await apiClient.getSessionAnalytics(sessionId);
      setSessionAnalytics(response);
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to load analytics: ${errorMessage}`);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleViewAnalytics = (session: LiveSession) => {
    setCurrentSession(session);
    setIsAnalyticsModalOpen(true);
    fetchSessionAnalytics(session.id);
  };

  const handleManageRecording = (session: LiveSession) => {
    setCurrentSession(session);
    setRecordingData({
      recording_url: session.recording_url || '',
      recording_expires_at: session.recording_expires_at ? 
        new Date(session.recording_expires_at).toISOString().slice(0, 16) : ''
    });
    setIsRecordingModalOpen(true);
  };

  const handleUpdateRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentSession) return;

    try {
      setRecordingLoading(true);
      
      await apiClient.updateSessionRecording(
        currentSession.id,
        recordingData.recording_url,
        recordingData.recording_expires_at
      );
      
      alert('Recording details updated successfully!');
      setIsRecordingModalOpen(false);
      await fetchSessionsData();
    } catch (err: any) {
      console.error('Error updating recording:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to update recording: ${errorMessage}`);
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleDeleteRecording = async () => {
    if (!currentSession) return;
    
    if (!confirm('Are you sure you want to delete this recording? This action cannot be undone.')) {
      return;
    }

    try {
      setRecordingLoading(true);
      await apiClient.deleteSessionRecording(currentSession.id);
      alert('Recording deleted successfully!');
      setIsRecordingModalOpen(false);
      await fetchSessionsData();
    } catch (err: any) {
      console.error('Error deleting recording:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to delete recording: ${errorMessage}`);
    } finally {
      setRecordingLoading(false);
    }
  };


  // Truly instant: jump straight into a fresh video room (LiveKit creates it on
  // join). No form, no scheduling — one click and you're live.
  const openInstantSession = () => {
    const roomId = `instant-${currentUser?.id || 'room'}-${Date.now()}`;
    router.push(`/teachers/meeting-room/${roomId}`);
  };

  const viewRecordings = () => {
    setSessionFilter('completed');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const quickActions = [
    { title: 'Start Instant Session', icon: Play, color: 'bg-forest-300', action: openInstantSession },
    { title: 'Schedule New Session', icon: Calendar, color: 'bg-terracotta', action: () => setIsNewSessionModalOpen(true) },
    { title: 'View Recordings', icon: Video, color: 'bg-coral-300', action: viewRecordings },
  ];

  const sessionsArray = Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : [];
  const filteredSessions = sessionsArray.filter(session => {
    const matchesSearch = session?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         session?.course?.subject?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         session?.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = sessionFilter === 'all' || session?.status === sessionFilter;

    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-coral/15 text-coral';
      case 'upcoming': return 'bg-terracotta/15 text-terracotta-500';
      case 'completed': return 'bg-forest/15 text-forest-500';
      case 'scheduled': return 'bg-mustard/20 text-mustard-500';
      case 'cancelled': return 'bg-cream-100 text-espresso';
      default: return 'bg-cream-100 text-espresso';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'live': return <PlayCircle className="w-4 h-4 text-coral" />;
      case 'upcoming': return <Clock className="w-4 h-4 text-terracotta" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-forest" />;
      case 'scheduled': return <Calendar className="w-4 h-4 text-mustard-500" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-espresso/70" />;
      default: return <AlertCircle className="w-4 h-4 text-espresso/70" />;
    }
  };

  const formatTime = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'Invalid time';
    }
  };

  const formatDate = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const calculateDuration = (start: string, end: string) => {
    try {
      const startTime = new Date(start);
      const endTime = new Date(end);
      const diffMs = endTime.getTime() - startTime.getTime();
      const diffMins = Math.round(diffMs / (1000 * 60));
      return `${diffMins} minutes`;
    } catch {
      return 'Unknown duration';
    }
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
                <PageHeader title="Your" accent="live sessions" />
                <p className="text-espresso/70 mt-1">Manage your virtual classes and online teaching sessions.</p>
                {lastUpdated && (
                  <p className="text-sm text-espresso/55 mt-2">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                    {autoRefresh && <span className="ml-2 text-forest">• Auto-refresh enabled</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.push('/teachers/live-sessions/enrollments')}
                  className="clay-card px-4 py-3 text-espresso hover:bg-cream-100 flex items-center"
                  title="Approve or reject students who asked to join"
                >
                  <Users className="w-5 h-5 mr-2 text-forest-500" />
                  Enrollment requests
                </button>
                <button
                  onClick={() => setIsNewSessionModalOpen(true)}
                  className="flex items-center inline-flex items-center gap-2 px-6 py-3 bg-terracotta text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  New Session
                </button>
              </div>
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {quickActions.map((action, index) => (
                <motion.div
                  key={action.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  onClick={action.action}
                  className={`${action.color} text-white rounded-lg p-6 cursor-pointer hover:scale-105 transition-transform shadow-lg`}
                >
                  <action.icon className="h-8 w-8 mb-3" />
                  <h3 className="font-semibold text-lg">{action.title}</h3>
                </motion.div>
              ))}
            </div>

            {}
            <div className="bg-cream-50 rounded-lg p-6 shadow-sm mb-8">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  />
                </div>
                <select
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="all">All Sessions ({sessionsData?.total_count || 0})</option>
                  <option value="upcoming">Upcoming ({sessionsData?.upcoming_count || 0})</option>
                  <option value="live">Live ({sessionsData?.live_count || 0})</option>
                  <option value="completed">Completed ({sessionsData?.completed_count || 0})</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button className="flex items-center px-4 py-2 border border-espresso/20 rounded-lg hover:bg-cream-100">
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </button>
              </div>
            </div>

            {}
            <div className="space-y-6">
              {isLoading ? (
                <div className="text-center py-10">
                  <p>Loading sessions...</p>
                </div>
              ) : error ? (
                <div className="text-center py-10">
                  <div className="bg-coral/10 border border-coral/30 rounded-lg p-6 max-w-md mx-auto">
                    <h3 className="text-lg font-medium text-coral mb-2">Unable to Load Sessions</h3>
                    <p className="text-coral mb-4">We're having trouble connecting to the server. Your sessions data couldn't be loaded right now.</p>
                    <button 
                      onClick={() => fetchSessionsData()}
                      className="bg-coral text-white px-4 py-2 rounded-lg hover:bg-coral-400 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-10">
                  <p>No sessions found matching your criteria.</p>
                </div>
              ) : (
                <>
                  {filteredSessions.map((session, index) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <h3 className="text-xl font-semibold text-espresso mr-3">
                          {session.title}
                        </h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getStatusColor(session.status)}`}>
                          {getStatusIcon(session.status)}
                          <span className="ml-2 capitalize">{session.status}</span>
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-espresso/55 mb-2">
                        <span className="mr-4">{session.course?.subject?.name || 'N/A'} • {session.course?.level || 'N/A'}</span>
                        <Calendar className="w-4 h-4 mr-1" />
                        <span className="mr-4">{formatDate(session.scheduled_start)}</span>
                        <Clock className="w-4 h-4 mr-1" />
                        <span>{formatTime(session.scheduled_start)} - {formatTime(session.scheduled_end)}</span>
                      </div>
                      <p className="text-espresso/70 mb-4">{session.description}</p>
                      <div className="flex items-center space-x-6 text-sm text-espresso/55">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-1" />
                          {session.current_participants}/{session.max_participants || 'N/A'} participants
                        </div>
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {calculateDuration(session.scheduled_start, session.scheduled_end)}
                        </div>
                        {session.is_recurring && (
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            Recurring
                          </div>
                        )}
                        {session.recording_enabled && (
                          <div className="flex items-center">
                            <Video className="w-4 h-4 mr-1" />
                            Recording enabled
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEditSession(session)}
                        className="p-2 text-espresso/45 hover:text-terracotta transition-colors"
                        title="Edit Session"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteSession(session)}
                        disabled={deleteSessionLoading}
                        className="p-2 text-espresso/45 hover:text-coral transition-colors disabled:opacity-50"
                        title="Delete Session"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {session.status === 'live' && (
                          <>
                            <button 
                              onClick={() => router.push(`/teachers/meeting-room/${session.id}`)}
                              className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                            >
                              <Video className="w-4 h-4 mr-2" />
                              Join Live
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(session.id, 'completed')}
                              className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-forest text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                            >
                              <Square className="w-4 h-4 mr-2" />
                              End Session
                            </button>
                          </>
                        )}
                        {(session.status === 'upcoming' || session.status === 'scheduled') && (
                          <>
                            <button
                              onClick={async () => {
                                try { await handleStatusUpdate(session.id, 'live'); } catch {}
                                router.push(`/teachers/meeting-room/${session.id}`);
                              }}
                              className="flex items-center inline-flex items-center gap-2 px-4 py-2 bg-forest text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Start &amp; Join
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(session.id, 'cancelled')}
                              className="flex items-center px-3 py-2 bg-espresso/85 text-white rounded-lg hover:bg-espresso transition-colors"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Cancel
                            </button>
                          </>
                        )}
                        {session.status === 'completed' && session.recording_url && (
                          <button 
                            onClick={() => router.push(session.recording_url || '')}
                            className="flex items-center px-4 py-2 bg-terracotta text-cream border-2 border-espresso rounded-full shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
                          >
                            <Video className="w-4 h-4 mr-2" />
                            View Recording
                          </button>
                        )}
                      </div>
                      <div className="flex items-center space-x-3">
                        <button 
                          onClick={() => handleViewParticipants(session)}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Participants
                        </button>
                        <button 
                          onClick={() => handleViewAnalytics(session)}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <BarChart3 className="w-4 h-4 mr-2" />
                          Analytics
                        </button>
                        <button 
                          onClick={() => handleManageRecording(session)}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Recording
                        </button>
                        <button 
                          onClick={() => {
                            setCurrentSession(session);
                            setIsShareModalOpen(true);
                          }}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <Share className="w-4 h-4 mr-2" />
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
                  ))}
                </>
              )}
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Total Sessions</h3>
                <div className="text-3xl font-bold text-terracotta">{sessionsData?.total_count || 0}</div>
                <p className="text-espresso/70">All time</p>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Upcoming</h3>
                <div className="text-3xl font-bold text-mustard-500">{sessionsData?.upcoming_count || 0}</div>
                <p className="text-espresso/70">Scheduled</p>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Live Now</h3>
                <div className="text-3xl font-bold text-coral">{sessionsData?.live_count || 0}</div>
                <p className="text-espresso/70">Active sessions</p>
              </div>
              <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                <h3 className="text-lg font-semibold text-espresso mb-2">Completed</h3>
                <div className="text-3xl font-bold text-forest">{sessionsData?.completed_count || 0}</div>
                <p className="text-espresso/70">Finished</p>
              </div>
            </div>
          </motion.div>
        </main>
      </div>

      {}
      {isNewSessionModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b-2 border-espresso/15 bg-espresso text-cream rounded-t-2xl flex-shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-cream">Create New Session</h2>
                <button
                  onClick={() => setIsNewSessionModalOpen(false)}
                  className="text-cream/65 hover:text-cream p-2 rounded-full hover:bg-cream/10 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
              
            <div className="overflow-y-auto flex-1 p-6">
              <form onSubmit={handleCreateSession}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Session Title
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={newSessionData.title}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Advanced Mathematics - Calculus"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Subject <span className="text-espresso/45">(optional)</span>
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={newSessionData.subject}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Mathematics"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Grade/Level <span className="text-espresso/45">(optional)</span>
                    </label>
                    <input
                      type="text"
                      name="grade"
                      value={newSessionData.grade}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Grade 12"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={newSessionData.date}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      name="time"
                      value={newSessionData.time}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Duration (minutes)
                    </label>
                    <select
                      name="duration"
                      value={newSessionData.duration}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      required
                    >
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes</option>
                      <option value="90">90 minutes</option>
                      <option value="120">120 minutes</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Max Participants <span className="text-espresso/45">(optional)</span>
                    </label>
                    <input
                      type="number"
                      name="maxParticipants"
                      value={newSessionData.maxParticipants}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      min="1"
                      max="100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Session Price (LKR)
                    </label>
                    <input
                      type="number"
                      name="price"
                      value={newSessionData.price}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="recordingEnabled"
                        checked={newSessionData.recordingEnabled}
                        onChange={(e) => setNewSessionData(prev => ({ ...prev, recordingEnabled: e.target.checked }))}
                        className="w-4 h-4 text-teacher-600 rounded focus:ring-teacher-500"
                      />
                      <label className="ml-2 text-sm text-espresso">Enable Recording</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="isRecurring"
                        checked={newSessionData.isRecurring}
                        onChange={(e) => setNewSessionData(prev => ({ ...prev, isRecurring: e.target.checked }))}
                        className="w-4 h-4 text-teacher-600 rounded focus:ring-teacher-500"
                      />
                      <label className="ml-2 text-sm text-espresso">Recurring Session</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="requiresPayment"
                        checked={newSessionData.requiresPayment}
                        onChange={(e) => setNewSessionData(prev => ({ ...prev, requiresPayment: e.target.checked }))}
                        className="w-4 h-4 text-teacher-600 rounded focus:ring-teacher-500"
                      />
                      <label className="ml-2 text-sm text-espresso">Requires Payment</label>
                    </div>
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={newSessionData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    placeholder="Describe what will be covered in this session..."
                    required
                  />
                </div>

                {}
                <div className="mb-6 p-6 border-2 border-blue-100 bg-terracotta/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <Accessibility className="h-5 w-5 text-terracotta" />
                    <h3 className="text-lg font-semibold text-espresso">Accessibility Options</h3>
                  </div>
                  <p className="text-sm text-espresso/70 mb-4">
                    Help students find sessions that accommodate their specific needs
                  </p>

                  {}
                  <div className="mb-4 p-3 bg-cream-50 rounded-lg border">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="accessible-all"
                        checked={accessibleForAll}
                        onChange={(e) => {
                          setAccessibleForAll(e.target.checked);
                          if (e.target.checked) {
                            setTargetDisabilities([]);
                          }
                        }}
                        className="w-4 h-4 text-terracotta rounded"
                      />
                      <label htmlFor="accessible-all" className="ml-2 font-medium text-espresso">
                        ✅ Accessible for All Students
                      </label>
                    </div>
                    <p className="text-xs text-espresso/55 mt-1 ml-6">
                      This session accommodates students with any disability
                    </p>
                  </div>

                  {}
                  {!accessibleForAll && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-espresso mb-2">
                        Or select specific disabilities this session accommodates:
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {disabilityTypes.map((type) => {
                          const isSelected = targetDisabilities.includes(type.id);
                          return (
                            <div
                              key={type.id}
                              onClick={() => toggleDisability(type.id)}
                              className={`p-2 border-2 rounded-lg cursor-pointer transition-all text-center ${
                                isSelected
                                  ? 'border-terracotta bg-terracotta/15'
                                  : 'border-espresso/15 bg-cream-50 hover:border-espresso/20'
                              }`}
                            >
                              <div className="text-2xl mb-1">{type.icon}</div>
                              <div className="text-xs font-medium">{type.name}</div>
                            </div>
                          );
                        })}
                      </div>
                      {targetDisabilities.length > 0 && (
                        <p className="text-xs text-forest mt-2">
                          ✓ {targetDisabilities.length} disability type(s) selected
                        </p>
                      )}
                    </div>
                  )}

                  {}
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-medium text-espresso mb-2">Live Accessibility Features:</p>
                    
                    <div className="flex items-center p-2 bg-cream-50 rounded border">
                      <input
                        type="checkbox"
                        id="live-captions"
                        checked={hasLiveCaptions}
                        onChange={(e) => setHasLiveCaptions(e.target.checked)}
                        className="w-4 h-4 text-terracotta rounded"
                      />
                      <label htmlFor="live-captions" className="ml-2 flex items-center gap-2 text-sm">
                        <Subtitles className="h-4 w-4 text-terracotta" />
                        Real-time Captions/Subtitles
                      </label>
                    </div>

                    <div className="flex items-center p-2 bg-cream-50 rounded border">
                      <input
                        type="checkbox"
                        id="sign-language"
                        checked={hasSignLanguage}
                        onChange={(e) => setHasSignLanguage(e.target.checked)}
                        className="w-4 h-4 text-terracotta rounded"
                      />
                      <label htmlFor="sign-language" className="ml-2 flex items-center gap-2 text-sm">
                        <Accessibility className="h-4 w-4 text-terracotta" />
                        Sign Language Interpreter Available
                      </label>
                    </div>
                  </div>

                  {}
                  <div>
                    <p className="text-sm font-medium text-espresso mb-2">Accessibility Level:</p>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setAccessibilityLevel(level)}
                          className={`flex-1 py-2 text-xs font-medium rounded border-2 transition-all ${
                            accessibilityLevel === level
                              ? 'border-terracotta bg-terracotta/15 text-terracotta-500'
                              : 'border-espresso/15 bg-cream-50 text-espresso/70 hover:border-espresso/20'
                          }`}
                        >
                          {level === 1 && '★'}
                          {level === 2 && '★★'}
                          {level === 3 && '★★★'}
                          {level === 4 && '★★★★'}
                          {level === 5 && '★★★★★'}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-espresso/55 mt-1">
                      Higher levels indicate more comprehensive accessibility accommodations
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-6 border-t border-espresso/15 sticky bottom-0 bg-cream-50">
                  <button
                    type="button"
                    onClick={() => setIsNewSessionModalOpen(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSessionLoading}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createSessionLoading ? 'Creating...' : 'Create Session'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {isShareModalOpen && currentSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Share Session</h2>
                <button 
                  onClick={() => setIsShareModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <h3 className="font-medium text-espresso mb-2">{currentSession.title}</h3>
                <p className="text-espresso/70 text-sm mb-4">{formatDate(currentSession.scheduled_start)} at {formatTime(currentSession.scheduled_start)}</p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Meeting Link
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={currentSession.meeting_link || 'N/A'}
                      readOnly
                      className="flex-1 p-2 border border-espresso/20 rounded-l-lg"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(currentSession.meeting_link || '');
                        alert('Link copied to clipboard!');
                      }}
                      className="bg-teacher-600 text-white p-2 rounded-r-lg hover:bg-teacher-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Invitation Message
                  </label>
                  <textarea
                    defaultValue={`Join my session "${currentSession.title}" on ${formatDate(currentSession.scheduled_start)} at ${formatTime(currentSession.scheduled_start)}. Meeting link: ${currentSession.meeting_link || 'N/A'}`}
                    rows={3}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {isEditSessionModalOpen && currentSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-espresso">Edit Session</h2>
                <button 
                  onClick={() => setIsEditSessionModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateSession}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Session Title *
                    </label>
                    <input
                      type="text"
                      value={editSessionData.title}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      placeholder="Advanced Mathematics - Calculus"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Session Type *
                    </label>
                    <select
                      value={editSessionData.session_type}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, session_type: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      required
                    >
                      <option value="live_session">Live Session</option>
                      <option value="workshop">Workshop</option>
                      <option value="practical_session">Practical Session</option>
                      <option value="lab">Lab</option>
                      <option value="meeting">Meeting</option>
                      <option value="consultation">Consultation</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Session Mode *
                    </label>
                    <select
                      value={editSessionData.session_mode}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, session_mode: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      required
                    >
                      <option value="online">Online</option>
                      <option value="in_person">In Person</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Max Participants
                    </label>
                    <input
                      type="number"
                      value={editSessionData.max_participants}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, max_participants: parseInt(e.target.value) }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      min="1"
                      max="100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Scheduled Start *
                    </label>
                    <input
                      type="datetime-local"
                      value={editSessionData.scheduled_start}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, scheduled_start: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Scheduled End *
                    </label>
                    <input
                      type="datetime-local"
                      value={editSessionData.scheduled_end}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, scheduled_end: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Meeting Link
                    </label>
                    <input
                      type="url"
                      value={editSessionData.meeting_link}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, meeting_link: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      placeholder="https://zoom.us/j/123456789"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={editSessionData.location}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      placeholder="Room 101 or Online"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editSessionData.recording_enabled}
                        onChange={(e) => setEditSessionData(prev => ({ ...prev, recording_enabled: e.target.checked }))}
                        className="w-4 h-4 text-terracotta rounded focus:ring-terracotta"
                      />
                      <label className="ml-2 text-sm text-espresso">Enable Recording</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editSessionData.is_recurring}
                        onChange={(e) => setEditSessionData(prev => ({ ...prev, is_recurring: e.target.checked }))}
                        className="w-4 h-4 text-terracotta rounded focus:ring-terracotta"
                      />
                      <label className="ml-2 text-sm text-espresso">Recurring Session</label>
                    </div>
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Description
                  </label>
                  <textarea
                    value={editSessionData.description}
                    onChange={(e) => setEditSessionData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                    placeholder="Describe what will be covered in this session..."
                  />
                </div>
                
                {editSessionData.is_recurring && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Recurrence Pattern
                    </label>
                    <input
                      type="text"
                      value={editSessionData.recurrence_pattern}
                      onChange={(e) => setEditSessionData(prev => ({ ...prev, recurrence_pattern: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      placeholder="e.g., Every Monday & Wednesday"
                    />
                  </div>
                )}
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditSessionModalOpen(false)}
                    className="px-6 py-3 text-espresso bg-cream-100 rounded-lg hover:bg-cream-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSessionLoading}
                    className="px-6 py-3 bg-terracotta text-white rounded-lg hover:bg-terracotta-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editSessionLoading ? 'Updating...' : 'Update Session'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {isChatModalOpen && currentSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Session Chat</h2>
                <button 
                  onClick={() => setIsChatModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <h3 className="font-medium text-espresso mb-2">{currentSession.title}</h3>
                <p className="text-espresso/70 text-sm mb-4">Chat with participants</p>
                
                <div className="h-64 border border-espresso/20 rounded-lg p-4 mb-4 overflow-y-auto">
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex">
                        <div className="bg-cream-300 border-2 border-dashed rounded-xl w-8 h-8 mr-2" />
                        <div>
                          <div className="font-medium">Student {i+1}</div>
                          <div className="bg-cream-100 p-3 rounded-lg">
                            This is a sample message about the session
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="text"
                    placeholder="Type your message..."
                    className="flex-1 p-3 border border-espresso/20 rounded-l-lg"
                  />
                  <button className="bg-teacher-600 text-white p-3 rounded-r-lg hover:bg-teacher-700">
                    Send
                  </button>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setIsChatModalOpen(false)}
                  className="px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                >
                  Close Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {isParticipantsModalOpen && currentSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Session Participants</h2>
                <button 
                  onClick={() => setIsParticipantsModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <h3 className="font-medium text-espresso mb-2">{currentSession.title}</h3>
                <p className="text-espresso/70 text-sm mb-4">Manage session participants</p>
                
                {participantsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teacher-600 mx-auto"></div>
                    <p className="text-espresso/70 mt-2">Loading participants...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionParticipants.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="w-12 h-12 text-espresso/45 mx-auto mb-2" />
                        <p className="text-espresso/70">No participants yet</p>
                      </div>
                    ) : (
                      sessionParticipants.map((participant: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-4 border border-espresso/15 rounded-lg">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-cream-300 rounded-full flex items-center justify-center mr-3">
                              <User className="w-5 h-5 text-espresso/70" />
                            </div>
                            <div>
                              <div className="font-medium text-espresso">
                                {participant.student?.profile?.first_name} {participant.student?.profile?.last_name}
                              </div>
                              <div className="text-sm text-espresso/70">{participant.student?.email}</div>
                              {participant.joined_at && (
                                <div className="text-xs text-forest">
                                  Joined: {new Date(participant.joined_at).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              participant.joined_at ? 'bg-forest/15 text-forest-500' : 'bg-cream-100 text-espresso'
                            }`}>
                              {participant.joined_at ? 'Joined' : 'Invited'}
                            </span>
                            <button
                              onClick={() => removeSessionParticipant(participant.student.id)}
                              className="p-1 text-coral hover:text-coral"
                              title="Remove participant"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setIsParticipantsModalOpen(false)}
                  className="px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                >
                  Close
                </button>
                <button
                  className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700"
                >
                  Add Participant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {isAnalyticsModalOpen && currentSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Session Analytics</h2>
                <button 
                  onClick={() => setIsAnalyticsModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <h3 className="font-medium text-espresso mb-2">{currentSession.title}</h3>
                <p className="text-espresso/70 text-sm mb-4">Detailed session statistics and analytics</p>
                
                {analyticsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teacher-600 mx-auto"></div>
                    <p className="text-espresso/70 mt-2">Loading analytics...</p>
                  </div>
                ) : sessionAnalytics ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div className="bg-terracotta/10 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-terracotta font-medium">Total Registered</p>
                          <p className="text-2xl font-bold text-terracotta-500">{sessionAnalytics.total_registered}</p>
                        </div>
                        <Users className="w-8 h-8 text-terracotta" />
                      </div>
                    </div>
                    
                    <div className="bg-forest/10 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-forest font-medium">Attendance Rate</p>
                          <p className="text-2xl font-bold text-forest-500">
                            {sessionAnalytics.attendance_rate ? `${sessionAnalytics.attendance_rate}%` : 'N/A'}
                          </p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-forest" />
                      </div>
                    </div>
                    
                    <div className="bg-coral/10 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-coral font-medium">Avg Duration</p>
                          <p className="text-2xl font-bold text-espresso">
                            {sessionAnalytics.avg_attendance_duration ? `${Math.round(sessionAnalytics.avg_attendance_duration)}m` : 'N/A'}
                          </p>
                        </div>
                        <Clock className="w-8 h-8 text-coral" />
                      </div>
                    </div>
                    
                    <div className="bg-terracotta/10 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-terracotta font-medium">Session Duration</p>
                          <p className="text-2xl font-bold text-orange-800">
                            {sessionAnalytics.session_duration_minutes ? `${sessionAnalytics.session_duration_minutes}m` : 'N/A'}
                          </p>
                        </div>
                        <PlayCircle className="w-8 h-8 text-terracotta" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 text-espresso/45 mx-auto mb-2" />
                    <p className="text-espresso/70">No analytics data available</p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setIsAnalyticsModalOpen(false)}
                  className="px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {isRecordingModalOpen && currentSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Recording Management</h2>
                <button 
                  onClick={() => setIsRecordingModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <h3 className="font-medium text-espresso mb-2">{currentSession.title}</h3>
                <p className="text-espresso/70 text-sm mb-4">Manage session recordings</p>
                
                <div className="bg-cream-100 p-4 rounded-lg mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium text-espresso">Recording Status</p>
                      <p className="text-sm text-espresso/70">
                        {currentSession.recording_enabled ? 'Recording is enabled for this session' : 'Recording is disabled'}
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm ${
                      currentSession.recording_enabled 
                        ? 'bg-forest/15 text-forest-500' 
                        : 'bg-cream-100 text-espresso'
                    }`}>
                      {currentSession.recording_enabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                  
                  {currentSession.recording_url ? (
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-espresso">Recording Available</p>
                          <p className="text-sm text-espresso/70">
                            Expires: {currentSession.recording_expires_at 
                              ? new Date(currentSession.recording_expires_at).toLocaleDateString()
                              : 'Never'
                            }
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => window.open(currentSession.recording_url, '_blank')}
                            className="px-3 py-1 bg-teacher-600 text-white rounded hover:bg-teacher-700"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecording()}
                            disabled={recordingLoading}
                            className="px-3 py-1 bg-coral text-white rounded hover:bg-coral-400 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t pt-4">
                      <p className="text-sm text-espresso/70">No recording available for this session</p>
                    </div>
                  )}
                </div>

                <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Recording URL
                    </label>
                    <input
                      type="url"
                      value={recordingData.recording_url}
                      onChange={(e) => setRecordingData(prev => ({ ...prev, recording_url: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      placeholder="https://zoom.us/rec/..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Expiration Date
                    </label>
                    <input
                      type="datetime-local"
                      value={recordingData.recording_expires_at}
                      onChange={(e) => setRecordingData(prev => ({ ...prev, recording_expires_at: e.target.value }))}
                      className="w-full p-3 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                    />
                  </div>
                </form>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setIsRecordingModalOpen(false)}
                  className="px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                >
                  Close
                </button>
                <button
                  onClick={(e) => handleUpdateRecording(e as React.FormEvent)}
                  disabled={recordingLoading}
                  className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50"
                >
                  {recordingLoading ? 'Updating...' : 'Update Recording'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherLiveSessionsPage;