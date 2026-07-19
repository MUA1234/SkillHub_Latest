'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, isAuthenticated, getCurrentUser } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Calendar,
  Search,
  Filter,
  MapPin,
  Users,
  Clock,
  Star,
  Eye,
  Edit,
  Trash2,
  Play,
  CheckCircle,
  Award,
  TrendingUp,
  Target,
  Download,
  Video,
  Coffee,
  Mic,
  ExternalLink,
  Loader,
  AlertCircle
} from 'lucide-react';

interface SponsorEvent {
  id: string;
  title: string;
  description: string;
  status: string;
  type: string;
  isVirtual: boolean;
  startDate: string;
  endDate: string;
  location: string;
  currentAttendees?: number;
  registeredAttendees?: number;
  maxAttendees: number;
  sponsorshipLevel?: string;
  budget: string | number;
  targetAudience?: string;
  benefits?: string[];
  category?: string;
  level?: string;
  imageUrl?: string;
  tags?: string[];
  hasCertificate?: boolean;
  isFeatured?: boolean;
  actualROI?: string;
  expectedROI?: string;
  created_at?: string;
  updated_at?: string;
}

interface EventStats {
  totalEvents: number;
  totalAttendees: number;
  totalInvestment: number;
  averageROI: number;
}

const SponsorEventsPage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewEvent, setViewEvent] = useState<any | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SponsorEvent | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [events, setEvents] = useState<SponsorEvent[]>([]);
  const [eventStats, setEventStats] = useState<EventStats>({
    totalEvents: 0,
    totalAttendees: 0,
    totalInvestment: 0,
    averageROI: 0
  });
  
  const currentUser = getCurrentUser();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    
    if (currentUser?.role !== 'sponsor') {
      router.push('/auth');
      return;
    }
    
    loadEvents();
  }, [router, currentUser?.role]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!loading) {
        loadEvents();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [statusFilter]);

  const loadEvents = async () => {
    setLoading(true);
    setError('');
    
    try {
      const result = await apiClient.getSponsorEvents({
        status_filter: statusFilter,
        page: 1,
        limit: 50
      });

      if (result.success) {
        setEvents(Array.isArray(result.data?.events) ? result.data.events : []);

        const summary = result.data?.summary || {};
        setEventStats({
          totalEvents: summary.totalEvents || 0,
          totalAttendees: summary.totalAttendees || 0,
          totalInvestment: summary.totalInvestment || 0,
          averageROI: summary.averageROI || 0
        });
      } else {
        setEvents([]);
        setError('Failed to load events');
      }

    } catch (err: any) {
      console.error('Error loading events:', err);
      setEvents([]);
      setError('Failed to load events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (eventData: {
    title: string;
    description: string;
    category: string;
    startDate: string;
    endDate: string;
    location: string;
    isVirtual: boolean;
    budget: number;
    maxAttendees: number;
    level?: string;
    hasCertificate?: boolean;
    tags?: string[];
  }) => {
    setIsProcessing(true);
    try {
      const result = await apiClient.createSponsorEvent(eventData);
      
      if (result.success) {
        setShowCreateModal(false);
        loadEvents();
        alert('Event created successfully!');
      } else {
        setError('Failed to create event');
      }
    } catch (error) {
      console.error('Error creating event:', error);
      setError('Failed to create event. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditEvent = async (eventData: any) => {
    if (!selectedEvent) return;
    setIsProcessing(true);
    try {
      const result = await apiClient.updateSponsorEvent(selectedEvent.id, eventData);
      
      if (result.success) {
        setShowEditModal(false);
        setSelectedEvent(null);
        loadEvents();
        alert('Event updated successfully!');
      } else {
        setError('Failed to update event');
      }
    } catch (error) {
      console.error('Error updating event:', error);
      setError('Failed to update event. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    
    setIsProcessing(true);
    try {
      const result = await apiClient.deleteSponsorEvent(selectedEvent.id);
      
      if (result.success) {
        setShowDeleteModal(false);
        setSelectedEvent(null);
        loadEvents();
        alert('Event deleted successfully!');
      } else {
        setError('Failed to delete event');
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      setError('Failed to delete event. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (event: any) => {
    setSelectedEvent(event);
    setShowEditModal(true);
  };

  const openDeleteModal = (event: any) => {
    setSelectedEvent(event);
    setShowDeleteModal(true);
  };

  const openCreateModal = () => {
    setShowCreateModal(true);
  };

  const handleLaunchEvent = async (eventId: string, eventTitle: string) => {
    if (!confirm(`Are you sure you want to launch "${eventTitle}"?`)) {
      return;
    }

    try {
      const result = await apiClient.launchSponsorEvent(eventId);
      
      if (result.success) {
        alert('Event launched successfully');
        loadEvents();
      } else {
        alert('Failed to launch event');
      }
    } catch (error) {
      console.error('Error launching event:', error);
      alert('Failed to launch event');
    }
  };

  const handleViewEvent = async (eventId: string) => {
    setShowViewModal(true);
    setViewEvent(null);
    setViewError(null);
    setViewLoading(true);
    try {
      const resp = await apiClient.getSponsorEvent(eventId);
      const data = resp?.event || resp?.data || resp || null;
      if (!data) throw new Error('Event not found.');
      setViewEvent(data);
    } catch (err: any) {
      setViewError(err?.message || 'Could not load event details.');
    } finally {
      setViewLoading(false);
    }
  };

  const dynamicEventStats = [
    { 
      label: 'Total Events', 
      value: eventStats.totalEvents.toString(), 
      icon: Calendar, 
      change: '+6 this month' 
    },
    {
      label: 'Total Attendees',
      value: formatNumber(eventStats.totalAttendees, { locale: language }),
      icon: Users,
      change: '+18% growth'
    },
    {
      label: 'Event Investment',
      value: formatCurrency(eventStats.totalInvestment, { locale: language, compact: true }),
      icon: Target,
      change: '+25% increase'
    },
    { 
      label: 'Average ROI', 
      value: `${eventStats.averageROI}%`, 
      icon: TrendingUp, 
      change: '+15% improvement' 
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-terracotta/10 text-terracotta border-terracotta/30';
      case 'ongoing':
        return 'bg-forest/10 text-forest border-forest/30';
      case 'completed':
        return 'bg-coral/10 text-coral border-purple-200';
      case 'planned':
        return 'bg-terracotta/10 text-terracotta border-orange-200';
      default:
        return 'bg-cream-100 text-espresso/70 border-espresso/15';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Conference':
        return <Mic className="w-4 h-4" />;
      case 'Workshop':
        return <Users className="w-4 h-4" />;
      case 'Webinar':
        return <Video className="w-4 h-4" />;
      case 'Competition':
        return <Award className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation 
          userRole="sponsor"
          userName={currentUser?.profile?.first_name ? `${currentUser.profile.first_name} ${currentUser.profile.last_name || ''}`.trim() : currentUser?.email || "Sponsor"}
          userEmail={currentUser?.email || "sponsor@skillhub.com"}
        />
        <DashboardSidebar userRole="sponsor" />
        
        <div className="pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <Loader className="w-8 h-8 animate-spin text-coral mx-auto mb-4" />
                <p className="text-espresso/70">Loading events...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole="sponsor"
        userName={currentUser?.profile?.first_name ? `${currentUser.profile.first_name} ${currentUser.profile.last_name || ''}`.trim() : currentUser?.email || "Sponsor"}
        userEmail={currentUser?.email || "sponsor@skillhub.com"}
      />
      <DashboardSidebar userRole="sponsor" />
      
      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-coral/15 border border-red-300 text-coral px-4 py-3 rounded-lg mb-6 flex items-center space-x-3"
              >
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
                <button
                  onClick={() => setError('')}
                  className="ml-auto text-red-500 hover:text-coral"
                >
                  ×
                </button>
              </motion.div>
            )}

            {}
            <div className="flex items-center justify-between mb-8">
              <div>
                <PageHeader title="Your" accent="events" />
                <p className="text-espresso/70">
                  Manage your sponsored events and create new educational initiatives.
                </p>
              </div>
              <button 
                onClick={openCreateModal}
                className="inline-flex items-center inline-flex items-center gap-2 px-4 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create Event
              </button>
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {dynamicEventStats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-espresso/70">{stat.label}</p>
                        <p className="text-2xl font-bold text-espresso">{stat.value}</p>
                        <p className="text-sm text-forest">{stat.change}</p>
                      </div>
                      <Icon className="w-8 h-8 text-coral" />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {}
            <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mb-8">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search events..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="all">All Events</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="planned">Planned</option>
                  </select>
                  <button className="flex items-center px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors">
                    <Filter className="w-5 h-5 mr-2" />
                    More Filters
                  </button>
                  <button className="flex items-center px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors">
                    <Download className="w-5 h-5 mr-2" />
                    Export
                  </button>
                </div>
              </div>
            </div>

            {}
            <div className="space-y-6">
              {events.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid hover:shadow-kid-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <h3 className="text-xl font-semibold text-espresso mr-3">
                          {event.title}
                        </h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getStatusColor(event.status)}`}>
                          {getTypeIcon(event.type)}
                          <span className="ml-2 capitalize">{event.status}</span>
                        </span>
                        {event.isVirtual && (
                          <span className="ml-2 px-2 py-1 bg-terracotta/15 text-terracotta-500 rounded-full text-xs font-medium">
                            Virtual
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center text-sm text-espresso/70 mb-4">
                        <div className="flex items-center mr-6">
                          <Calendar className="w-4 h-4 mr-1" />
                          <span>{event.startDate ? formatDate(event.startDate) : 'TBD'}</span>
                        </div>
                        <div className="flex items-center mr-6">
                          <Clock className="w-4 h-4 mr-1" />
                          <span>
                            {event.startDate && event.endDate 
                              ? `${new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.endDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` 
                              : 'TBD'}
                          </span>
                        </div>
                        <div className="flex items-center mr-6">
                          <MapPin className="w-4 h-4 mr-1" />
                          <span>{event.location}</span>
                        </div>
                        <div className="flex items-center mr-6">
                          <Users className="w-4 h-4 mr-1" />
                          <span>{event.currentAttendees || event.registeredAttendees || 0}/{event.maxAttendees || 0} registered</span>
                        </div>
                        <span className="px-2 py-1 bg-cream-100 text-espresso/70 rounded-full text-xs">
                          {event.sponsorshipLevel || 'Standard'}
                        </span>
                      </div>

                      <p className="text-espresso/70 mb-4">{event.description}</p>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">{event.budget}</div>
                          <div className="text-sm text-espresso/55">Budget</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">{event.currentAttendees || event.registeredAttendees || 0}</div>
                          <div className="text-sm text-espresso/55">Attendees</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">{event.category}</div>
                          <div className="text-sm text-espresso/55">Category</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">{event.type}</div>
                          <div className="text-sm text-espresso/55">Type</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {event.actualROI || event.expectedROI}
                          </div>
                          <div className="text-sm text-espresso/55">
                            {event.actualROI ? 'Actual ROI' : 'Expected ROI'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div>
                          <h4 className="font-medium text-espresso mb-2">Target Audience</h4>
                          <p className="text-sm text-espresso/70">{event.targetAudience}</p>
                        </div>
                        <div>
                          <h4 className="font-medium text-espresso mb-2">Key Benefits</h4>
                          <div className="flex flex-wrap gap-2">
                            {(event.benefits || []).map((benefit, idx) => (
                              <span key={idx} className="px-2 py-1 bg-forest/15 text-forest-500 rounded-full text-xs">
                                {benefit}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleViewEvent(event.id)}
                        className="p-2 text-espresso/45 hover:text-espresso/70 transition-colors"
                        title="View event details"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => openEditModal(event)}
                        className="p-2 text-espresso/45 hover:text-espresso/70 transition-colors"
                        title="Edit event"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => openDeleteModal(event)}
                        className="p-2 text-espresso/45 hover:text-coral transition-colors"
                        title="Delete event"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {event.status === 'planned' && (
                          <button 
                            onClick={() => handleLaunchEvent(event.id, event.title)}
                            className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-forest text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Launch Event
                          </button>
                        )}
                        {event.status === 'completed' && (
                          <button className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-terracotta text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold">
                            <Award className="w-4 h-4 mr-2" />
                            View Results
                          </button>
                        )}
                        <button className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors">
                          <Users className="w-4 h-4 mr-2" />
                          Manage Attendees
                        </button>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button 
                          onClick={() => openEditModal(event)}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </button>
                        <button className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors">
                          <Download className="w-4 h-4 mr-2" />
                          Report
                        </button>
                        {event.isVirtual && (
                          <button className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-terracotta text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Join Event
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {}
            <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-8 mt-8 text-center">
              <h2 className="text-2xl font-bold text-espresso mb-4">Ready to Create Your Next Event?</h2>
              <p className="text-espresso/70 mb-6 max-w-2xl mx-auto">
                Host impactful educational events that bring together students, teachers, and industry professionals. 
                Our platform provides comprehensive event management tools to ensure your success.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={openCreateModal}
                  className="inline-flex items-center inline-flex items-center gap-2 px-8 py-3 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold font-semibold"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create New Event
                </button>
                <button className="inline-flex items-center px-8 py-3 border border-red-600 text-coral rounded-lg hover:bg-coral/10 transition-colors font-semibold">
                  <Calendar className="w-5 h-5 mr-2" />
                  Event Templates
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-espresso">Create New Event</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const eventData = {
                  title: formData.get('title') as string,
                  description: formData.get('description') as string,
                  category: formData.get('category') as string,
                  startDate: formData.get('startDate') as string,
                  endDate: formData.get('endDate') as string,
                  location: formData.get('location') as string,
                  isVirtual: formData.get('isVirtual') === 'on',
                  budget: parseFloat(formData.get('budget') as string),
                  maxAttendees: parseInt(formData.get('maxAttendees') as string),
                  level: formData.get('level') as string,
                  hasCertificate: formData.get('hasCertificate') === 'on',
                  tags: formData.get('tags') ? (formData.get('tags') as string).split(',').map(t => t.trim()) : []
                };
                handleCreateEvent(eventData);
              }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label htmlFor="title" className="block text-sm font-medium text-espresso mb-1">
                      Event Title *
                    </label>
                    <input
                      type="text"
                      id="title"
                      name="title"
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Enter event title"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="description" className="block text-sm font-medium text-espresso mb-1">
                      Description *
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      rows={3}
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Event description"
                    />
                  </div>

                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-espresso mb-1">
                      Category *
                    </label>
                    <select
                      id="category"
                      name="category"
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    >
                      <option value="">Select category</option>
                      <option value="workshop">Workshop</option>
                      <option value="webinar">Webinar</option>
                      <option value="conference">Conference</option>
                      <option value="bootcamp">Bootcamp</option>
                      <option value="seminar">Seminar</option>
                      <option value="networking">Networking</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="level" className="block text-sm font-medium text-espresso mb-1">
                      Level
                    </label>
                    <select
                      id="level"
                      name="level"
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    >
                      <option value="all">All Levels</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-espresso mb-1">
                      Start Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      id="startDate"
                      name="startDate"
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-espresso mb-1">
                      End Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      id="endDate"
                      name="endDate"
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="location" className="block text-sm font-medium text-espresso mb-1">
                      Location *
                    </label>
                    <input
                      type="text"
                      id="location"
                      name="location"
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Event location or online platform"
                    />
                  </div>

                  <div>
                    <label htmlFor="budget" className="block text-sm font-medium text-espresso mb-1">
                      Budget (LKR) *
                    </label>
                    <input
                      type="number"
                      id="budget"
                      name="budget"
                      required
                      min="0"
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Event budget"
                    />
                  </div>

                  <div>
                    <label htmlFor="maxAttendees" className="block text-sm font-medium text-espresso mb-1">
                      Max Attendees *
                    </label>
                    <input
                      type="number"
                      id="maxAttendees"
                      name="maxAttendees"
                      required
                      min="1"
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Maximum number of attendees"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="tags" className="block text-sm font-medium text-espresso mb-1">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      id="tags"
                      name="tags"
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="e.g., education, technology, innovation"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="isVirtual"
                        name="isVirtual"
                        className="h-4 w-4 text-coral focus:ring-red-500 border-espresso/20 rounded"
                      />
                      <label htmlFor="isVirtual" className="ml-2 block text-sm text-espresso">
                        Virtual/Online Event
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="hasCertificate"
                        name="hasCertificate"
                        className="h-4 w-4 text-coral focus:ring-red-500 border-espresso/20 rounded"
                      />
                      <label htmlFor="hasCertificate" className="ml-2 block text-sm text-espresso">
                        Provides Certificate
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 mt-8">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-espresso/70 hover:text-espresso font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="inline-flex items-center gap-2 px-6 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isProcessing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    <span>{isProcessing ? 'Creating...' : 'Create Event'}</span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {}
      {showEditModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-espresso">Edit Event</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const eventData = {
                  title: formData.get('title') as string,
                  description: formData.get('description') as string,
                  category: formData.get('category') as string,
                  startDate: formData.get('startDate') as string,
                  endDate: formData.get('endDate') as string,
                  location: formData.get('location') as string,
                  isVirtual: formData.get('isVirtual') === 'on',
                  budget: parseFloat(formData.get('budget') as string),
                  maxAttendees: parseInt(formData.get('maxAttendees') as string),
                  level: formData.get('level') as string,
                  hasCertificate: formData.get('hasCertificate') === 'on',
                  tags: formData.get('tags') ? (formData.get('tags') as string).split(',').map(t => t.trim()) : []
                };
                handleEditEvent(eventData);
              }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label htmlFor="editTitle" className="block text-sm font-medium text-espresso mb-1">
                      Event Title *
                    </label>
                    <input
                      type="text"
                      id="editTitle"
                      name="title"
                      required
                      defaultValue={selectedEvent.title}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Enter event title"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="editDescription" className="block text-sm font-medium text-espresso mb-1">
                      Description *
                    </label>
                    <textarea
                      id="editDescription"
                      name="description"
                      rows={3}
                      required
                      defaultValue={selectedEvent.description}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Event description"
                    />
                  </div>

                  <div>
                    <label htmlFor="editCategory" className="block text-sm font-medium text-espresso mb-1">
                      Category *
                    </label>
                    <select
                      id="editCategory"
                      name="category"
                      required
                      defaultValue={selectedEvent.category}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    >
                      <option value="">Select category</option>
                      <option value="workshop">Workshop</option>
                      <option value="webinar">Webinar</option>
                      <option value="conference">Conference</option>
                      <option value="bootcamp">Bootcamp</option>
                      <option value="seminar">Seminar</option>
                      <option value="networking">Networking</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="editLevel" className="block text-sm font-medium text-espresso mb-1">
                      Level
                    </label>
                    <select
                      id="editLevel"
                      name="level"
                      defaultValue={selectedEvent.level || 'all'}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    >
                      <option value="all">All Levels</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="editStartDate" className="block text-sm font-medium text-espresso mb-1">
                      Start Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      id="editStartDate"
                      name="startDate"
                      required
                      defaultValue={selectedEvent.startDate ? new Date(selectedEvent.startDate).toISOString().slice(0, -1) : ''}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="editEndDate" className="block text-sm font-medium text-espresso mb-1">
                      End Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      id="editEndDate"
                      name="endDate"
                      required
                      defaultValue={selectedEvent.endDate ? new Date(selectedEvent.endDate).toISOString().slice(0, -1) : ''}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="editLocation" className="block text-sm font-medium text-espresso mb-1">
                      Location *
                    </label>
                    <input
                      type="text"
                      id="editLocation"
                      name="location"
                      required
                      defaultValue={selectedEvent.location}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Event location or online platform"
                    />
                  </div>

                  <div>
                    <label htmlFor="editBudget" className="block text-sm font-medium text-espresso mb-1">
                      Budget (LKR) *
                    </label>
                    <input
                      type="number"
                      id="editBudget"
                      name="budget"
                      required
                      min="0"
                      defaultValue={selectedEvent.budget || 0}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Event budget"
                    />
                  </div>

                  <div>
                    <label htmlFor="editMaxAttendees" className="block text-sm font-medium text-espresso mb-1">
                      Max Attendees *
                    </label>
                    <input
                      type="number"
                      id="editMaxAttendees"
                      name="maxAttendees"
                      required
                      min="1"
                      defaultValue={selectedEvent.maxAttendees || 0}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Maximum number of attendees"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="editTags" className="block text-sm font-medium text-espresso mb-1">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      id="editTags"
                      name="tags"
                      defaultValue={selectedEvent.tags ? selectedEvent.tags.join(', ') : ''}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="e.g., education, technology, innovation"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="editIsVirtual"
                        name="isVirtual"
                        defaultChecked={selectedEvent.isVirtual || false}
                        className="h-4 w-4 text-coral focus:ring-red-500 border-espresso/20 rounded"
                      />
                      <label htmlFor="editIsVirtual" className="ml-2 block text-sm text-espresso">
                        Virtual/Online Event
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="editHasCertificate"
                        name="hasCertificate"
                        defaultChecked={selectedEvent.hasCertificate || false}
                        className="h-4 w-4 text-coral focus:ring-red-500 border-espresso/20 rounded"
                      />
                      <label htmlFor="editHasCertificate" className="ml-2 block text-sm text-espresso">
                        Provides Certificate
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 mt-8">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-espresso/70 hover:text-espresso font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="inline-flex items-center gap-2 px-6 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isProcessing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    <span>{isProcessing ? 'Updating...' : 'Update Event'}</span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {}
      {showViewModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowViewModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-event-title"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 id="view-event-title" className="text-xl font-bold text-espresso">
                  {viewEvent?.title || 'Event details'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowViewModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {viewLoading ? (
                <div className="flex items-center py-12 justify-center">
                  <Loader className="w-6 h-6 animate-spin text-terracotta mr-2" />
                  <span className="text-sm text-espresso/70">Loading event…</span>
                </div>
              ) : viewError ? (
                <div className="rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
                  {viewError}
                </div>
              ) : viewEvent ? (
                <div className="space-y-4">
                  {viewEvent.description && (
                    <p className="text-sm text-espresso/85 whitespace-pre-wrap">
                      {viewEvent.description}
                    </p>
                  )}

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {viewEvent.startDate || viewEvent.start_date ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Start
                        </dt>
                        <dd className="text-sm text-espresso font-semibold">
                          {new Date(viewEvent.startDate || viewEvent.start_date).toLocaleString()}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.endDate || viewEvent.end_date ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> End
                        </dt>
                        <dd className="text-sm text-espresso font-semibold">
                          {new Date(viewEvent.endDate || viewEvent.end_date).toLocaleString()}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.location ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Location
                        </dt>
                        <dd className="text-sm text-espresso font-semibold">
                          {viewEvent.isVirtual || viewEvent.is_virtual
                            ? `${viewEvent.location} (virtual)`
                            : viewEvent.location}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.type || viewEvent.event_type ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <Award className="w-3 h-3" /> Type
                        </dt>
                        <dd className="text-sm text-espresso font-semibold capitalize">
                          {viewEvent.type || viewEvent.event_type}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.status ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Status
                        </dt>
                        <dd className="text-sm text-espresso font-semibold capitalize">
                          {String(viewEvent.status).replace('_', ' ')}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.budget != null ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <Target className="w-3 h-3" /> Budget
                        </dt>
                        <dd className="text-sm text-espresso font-semibold">
                          {formatCurrency(Number(viewEvent.budget) || 0, { locale: language })}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.maxAttendees != null || viewEvent.max_attendees != null ? (
                      <div className="rounded-lg bg-cream-100 p-3">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1 inline-flex items-center gap-1">
                          <Users className="w-3 h-3" /> Capacity
                        </dt>
                        <dd className="text-sm text-espresso font-semibold">
                          {formatNumber(
                            (viewEvent.registeredAttendees ||
                              viewEvent.currentAttendees ||
                              viewEvent.current_attendees ||
                              0) as number,
                            { locale: language },
                          )}
                          {' / '}
                          {formatNumber(
                            (viewEvent.maxAttendees ||
                              viewEvent.max_attendees ||
                              0) as number,
                            { locale: language },
                          )}
                        </dd>
                      </div>
                    ) : null}
                    {viewEvent.targetAudience || viewEvent.target_audience ? (
                      <div className="rounded-lg bg-cream-100 p-3 sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wider text-espresso/55 mb-1">
                          Target audience
                        </dt>
                        <dd className="text-sm text-espresso/85">
                          {viewEvent.targetAudience || viewEvent.target_audience}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {Array.isArray(viewEvent.speakers) && viewEvent.speakers.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-espresso/55 mb-2 inline-flex items-center gap-1">
                        <Mic className="w-3 h-3" /> Speakers
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {viewEvent.speakers.map((s: string, i: number) => (
                          <li
                            key={i}
                            className="px-2 py-1 bg-terracotta/15 text-terracotta rounded-full text-xs"
                          >
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(viewEvent.benefits) && viewEvent.benefits.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-espresso/55 mb-2">
                        Sponsorship benefits
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {viewEvent.benefits.map((b: string, i: number) => (
                          <li
                            key={i}
                            className="px-2 py-1 bg-forest/15 text-forest-500 rounded-full text-xs"
                          >
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2">
                {viewEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewModal(false);
                      openEditModal(viewEvent);
                    }}
                    className="px-4 py-2 text-espresso/70 hover:text-espresso font-medium inline-flex items-center gap-1.5"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowViewModal(false)}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-espresso text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showDeleteModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-md w-full"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-espresso">Delete Event</h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                <p className="text-espresso/70 mb-2">
                  Are you sure you want to delete this event?
                </p>
                <div className="bg-cream-100 p-3 rounded-lg">
                  <p className="font-semibold text-espresso">{selectedEvent.title}</p>
                  <p className="text-sm text-espresso/55">Budget: {formatCurrency(selectedEvent.budget || 0, { locale: language })}</p>
                  <p className="text-sm text-espresso/55">
                    {selectedEvent.registeredAttendees || selectedEvent.currentAttendees || 0} registered attendees
                  </p>
                </div>
                <p className="text-coral text-sm mt-2">
                  This action cannot be undone and will cancel the event for all registered attendees.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-espresso/70 hover:text-espresso font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteEvent}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isProcessing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{isProcessing ? 'Deleting...' : 'Delete Event'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SponsorEventsPage; 