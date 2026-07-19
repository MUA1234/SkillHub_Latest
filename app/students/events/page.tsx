'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { getCurrentUser, isAuthenticated, apiClient } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  DollarSign,
  Search,
  Filter,
  Video,
  Share,
  Bookmark,
  Globe,
  Award,
  Zap,
  Loader2
} from 'lucide-react';

const StudentEventsPage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedPrice, setSelectedPrice] = useState('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'registered' | 'bookmarked'>('all');
  const [expandedEvents, setExpandedEvents] = useState<string[]>([]);
  const [brokenImageIds, setBrokenImageIds] = useState<string[]>([]);

  const [events, setEvents] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<any>({});

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  const locations = [
    { id: 'all', name: 'All Locations' },
    { id: 'online', name: 'Online' },
    { id: 'colombo', name: 'Colombo' },
    { id: 'kandy', name: 'Kandy' },
    { id: 'galle', name: 'Galle' },
    { id: 'jaffna', name: 'Jaffna' }
  ];

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }

    loadEventData();
  }, [router, currentUser?.role]);

  useEffect(() => {
    if (categories.length > 0) {
      const timeoutId = setTimeout(() => {
        loadEvents();
      }, searchQuery ? 300 : 0);

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, selectedCategory, selectedLocation, selectedPrice, categories.length]);

  const loadEventData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [categoriesResponse, eventsResponse] = await Promise.all([
        apiClient.getEventCategories(),
        apiClient.getEvents({
          search: searchQuery,
          category: selectedCategory,
          location: selectedLocation,
          price_filter: selectedPrice,
          page: 1,
          limit: 20
        })
      ]);

      if (categoriesResponse.success) {
        const categoriesData = Array.isArray(categoriesResponse.data) ? categoriesResponse.data : [];
        setCategories(categoriesData);
      }

      if (eventsResponse.success) {
        const eventsData = Array.isArray(eventsResponse.data?.events) ? eventsResponse.data.events : [];
        setEvents(eventsData);
        setPagination(eventsResponse.data?.pagination || {});
      }
    } catch (err: any) {
      console.error('Error loading event data:', err);
      console.error('Error details:', err?.response?.data?.detail || err?.message);
      setCategories([]);
      setEvents([]);
      setError(`Failed to load events: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      setError(null);

      const response = await apiClient.getEvents({
        search: searchQuery,
        category: selectedCategory,
        location: selectedLocation,
        price_filter: selectedPrice,
        page: 1,
        limit: 20
      });

      if (response.success) {
        const eventsData = Array.isArray(response.data?.events) ? response.data.events : [];
        setEvents(eventsData);
        setPagination(response.data?.pagination || {});
      }
    } catch (err: any) {
      console.error('Error loading events:', err);
      console.error('Error details:', err?.response?.data?.detail || err?.message);
      setEvents([]);
      setError(`Failed to load events: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`);
    }
  };

  const handleRegister = async (eventId: string, isRegistered: boolean) => {
    try {
      setIsLoadingAction(true);
      
      let response;
      if (isRegistered) {
        response = await apiClient.unregisterFromEvent(eventId);
      } else {
        response = await apiClient.registerForEvent(eventId);
      }

      if (response.success) {
        setEvents(prev => prev.map(event => 
          event.id === eventId 
            ? { 
                ...event, 
                is_registered: !isRegistered,
                attendees: isRegistered ? event.attendees - 1 : event.attendees + 1
              }
            : event
        ));
        
        alert(response.message);
      } else {
        alert('Failed to update registration');
      }
    } catch (err: any) {
      console.error('Error updating registration:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to update registration: ${errorMessage}`);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleBookmark = async (eventId: string, isBookmarked: boolean) => {
    try {
      setIsLoadingAction(true);

      let response;
      if (isBookmarked) {
        response = await apiClient.removeBookmarkEvent(eventId);
      } else {
        response = await apiClient.bookmarkEvent(eventId);
      }

      if (response.success) {
        setEvents(prev => prev.map(event => 
          event.id === eventId 
            ? { ...event, is_bookmarked: !isBookmarked }
            : event
        ));
      } else {
        alert('Failed to update bookmark');
      }
    } catch (err: any) {
      console.error('Error updating bookmark:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Unknown error';
      alert(`Failed to update bookmark: ${errorMessage}`);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const filteredEvents = (Array.isArray(events) ? events : []).filter((event) => {
    if (viewFilter === 'registered') return event.is_registered;
    if (viewFilter === 'bookmarked') return event.is_bookmarked;
    return true;
  });

  const formatEventDate = (startDate: string) => {
    if (!startDate) return 'TBD';
    return new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatEventDuration = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return null;
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${Math.round(ms / (1000 * 60))} min`;
    if (hours < 24) return `${Math.round(hours * 10) / 10} hr${hours >= 2 ? 's' : ''}`;
    return `${Math.round(hours / 24)} day${hours >= 48 ? 's' : ''}`;
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return 'text-forest bg-forest/15';
      case 'Intermediate': return 'text-mustard-500 bg-mustard/20';
      case 'Advanced': return 'text-coral bg-coral/15';
      default: return 'text-terracotta bg-terracotta/15';
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
      
      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <PageHeader title="What's" accent="coming up" />
            <p className="text-espresso/70">
              Discover and participate in educational events, workshops, and conferences.
            </p>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="clay-card p-6 mb-8"
          >
            {}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-espresso/45" />
              <input
                type="text"
                placeholder="Search events, topics, or organizers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="clay-input w-full pl-10 pr-4 py-3 text-lg"
              />
            </div>

            {}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {}
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="clay-input w-full px-3 py-2"
                >
                  {(Array.isArray(categories) ? categories : []).map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.count || 0})
                    </option>
                  ))}
                </select>
              </div>

              {}
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">Location</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="clay-input w-full px-3 py-2"
                >
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              {}
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">Price</label>
                <select
                  value={selectedPrice}
                  onChange={(e) => setSelectedPrice(e.target.value)}
                  className="clay-input w-full px-3 py-2"
                >
                  <option value="all">All Prices</option>
                  <option value="free">Free Events</option>
                  <option value="paid">Paid Events</option>
                </select>
              </div>

              {}
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">Quick Actions</label>
                <div className="flex space-x-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewFilter(viewFilter === 'registered' ? 'all' : 'registered')}
                    className={`clay-card px-3 py-2 text-sm transition-colors ${viewFilter === 'registered' ? 'text-forest font-semibold' : 'text-espresso/70 hover:text-espresso'}`}
                  >
                    My Events
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewFilter(viewFilter === 'bookmarked' ? 'all' : 'bookmarked')}
                    className={`clay-card px-3 py-2 text-sm transition-colors ${viewFilter === 'bookmarked' ? 'text-mustard-500 font-semibold' : 'text-espresso/70 hover:text-espresso'}`}
                  >
                    Bookmarked
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-espresso/70">Loading events...</span>
              </div>
            ) : error ? (
              <div className="bg-coral/10 border border-coral/30 rounded-lg p-4">
                <p className="text-coral">{error}</p>
                <button 
                  onClick={loadEventData}
                  className="mt-2 text-sm text-coral hover:text-coral underline"
                >
                  Try Again
                </button>
              </div>
            ) : (
            <p className="text-espresso/70">
                Found {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
              {searchQuery && ` for "${searchQuery}"`}
              {viewFilter !== 'all' && ` (${viewFilter})`}
            </p>
            )}
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid lg:grid-cols-2 gap-6"
          >
            {filteredEvents.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="clay-card clay-card-hover overflow-hidden flex flex-col h-full"
              >
                {}
                <div className="relative h-48 flex-shrink-0 bg-terracotta/10">
                  {event.image_url && !brokenImageIds.includes(event.id) ? (
                    <img
                      src={event.image_url}
                      alt={event.title}
                      onError={() => setBrokenImageIds((prev) => [...prev, event.id])}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Calendar className="w-12 h-12 text-terracotta/40" />
                    </div>
                  )}

                  {}
                  <div className="absolute top-4 left-4 flex flex-col space-y-2">
                    <span className="px-3 py-1 bg-terracotta text-white rounded-full text-xs font-medium inline-flex items-center h-6">
                      {(event.category || '').toUpperCase()}
                    </span>
                    {event.is_featured && (
                      <span className="px-3 py-1 bg-mustard-500 text-white rounded-full text-xs font-medium inline-flex items-center h-6 space-x-1">
                        <Zap className="w-3 h-3" />
                        <span>Featured</span>
                      </span>
                    )}
                  </div>

                  {}
                  <div className="absolute top-4 right-4 flex space-x-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleBookmark(event.id, event.is_bookmarked)}
                      disabled={isLoadingAction}
                      className={`clay-card w-8 h-8 flex items-center justify-center ${event.is_bookmarked ? 'text-mustard-500' : 'text-espresso/70'} hover:text-mustard-500 transition-colors disabled:opacity-50`}
                      title={event.is_bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                    >
                      {isLoadingAction ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                      <Bookmark className="w-4 h-4" />
                      )}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={async () => {
                        const url = `${window.location.origin}/students/events?event=${event.id}`;
                        if (navigator.share) {
                          try { await navigator.share({ title: event.title, url }); } catch {}
                        } else {
                          await navigator.clipboard.writeText(url);
                          alert('Event link copied to clipboard');
                        }
                      }}
                      className="clay-card w-8 h-8 flex items-center justify-center text-espresso/70 hover:text-terracotta transition-colors"
                      title="Share event"
                    >
                      <Share className="w-4 h-4" />
                    </motion.button>
                  </div>

                  {}
                  <div className="absolute bottom-4 right-4">
                    <div className="clay-card bg-cream-50 bg-opacity-90 px-3 py-1 h-6 flex items-center">
                      {event.original_price != null && event.original_price > event.price && (
                        <span className="text-xs text-espresso/55 line-through mr-2">
                          {formatCurrency(event.original_price, { locale: language, compact: true })}
                        </span>
                      )}
                      <span className={`text-sm font-bold ${
                        event.is_free ? 'text-forest' : 'text-terracotta'
                      }`}>
                        {event.is_free ? 'Free' : formatCurrency(event.price, { locale: language, compact: true })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  {}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1 min-h-[80px] flex flex-col justify-between">
                      <h3 className="text-lg font-bold text-espresso mb-2 line-clamp-2 min-h-[56px]">
                        {event.title}
                      </h3>
                      <div className="flex items-center space-x-2 h-8">
                        <img
                          src={event.organizer_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(event.organizer_name || 'Organizer')}&background=random`}
                          alt={event.organizer_name}
                          className="w-8 h-8 clay-card object-cover rounded-full"
                        />
                        <span className="text-sm text-espresso/70">{event.organizer_name}</span>
                      </div>
                    </div>

                    {event.level && (
                      <div className="text-right ml-4 flex flex-col items-end">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium h-6 inline-flex items-center justify-center ${getLevelColor(event.level)}`}>
                          {event.level}
                        </span>
                      </div>
                    )}
                  </div>

                  {}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center space-x-2 h-8">
                      <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-espresso/70" />
                      </div>
                      <span className="text-sm text-espresso/70">{formatEventDate(event.start_date)}</span>
                    </div>
                    <div className="flex items-center space-x-2 h-8">
                      <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                        {event.is_online ? (
                          <Video className="w-4 h-4 text-espresso/70" />
                        ) : (
                          <MapPin className="w-4 h-4 text-espresso/70" />
                        )}
                      </div>
                      <span className="text-sm text-espresso/70">{event.is_online ? 'Online' : (event.location || 'TBD')}</span>
                    </div>
                  </div>

                  {}
                  <p className="text-espresso/70 text-sm mb-4 line-clamp-2 min-h-[40px]">
                    {event.description}
                  </p>

                  {}
                  <motion.div
                    initial={false}
                    animate={{ height: expandedEvents.includes(event.id) ? "auto" : 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-6">
                      {}
                      <div className="grid grid-cols-2 gap-4">
                        {formatEventDuration(event.start_date, event.end_date) && (
                          <div className="flex items-center space-x-2 h-8">
                            <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                              <Clock className="w-4 h-4 text-espresso/70" />
                            </div>
                            <span className="text-sm text-espresso/70">{formatEventDuration(event.start_date, event.end_date)}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2 h-8">
                          <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                            <Users className="w-4 h-4 text-espresso/70" />
                          </div>
                          <span className="text-sm text-espresso/70">{event.current_attendees}/{event.max_attendees || 'N/A'}</span>
                        </div>
                      </div>

                      {}
                      {(Array.isArray(event.tags) ? event.tags : []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {event.tags.slice(0, 4).map((tag: string) => (
                            <span
                              key={tag}
                              className="clay-card px-3 py-1 text-xs text-espresso/70 h-6 inline-flex items-center"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {}
                      <div className="grid grid-cols-3 gap-4">
                        {event.has_certificate && (
                          <div className="flex items-center space-x-2 h-8">
                            <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                              <Award className="w-4 h-4 text-espresso/70" />
                            </div>
                            <span className="text-xs text-espresso/55">Certificate</span>
                          </div>
                        )}
                        {(Array.isArray(event.languages) ? event.languages : []).length > 0 && (
                          <div className="flex items-center space-x-2 h-8">
                            <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                              <Globe className="w-4 h-4 text-espresso/70" />
                            </div>
                            <span className="text-xs text-espresso/55">{event.languages.join(', ')}</span>
                          </div>
                        )}
                        {event.sponsor && (
                          <div className="flex items-center space-x-2 h-8">
                            <div className="w-8 h-8 clay-card rounded-full flex items-center justify-center">
                              <Zap className="w-4 h-4 text-espresso/70" />
                            </div>
                            <span className="text-xs text-espresso/55">Sponsored</span>
                          </div>
                        )}
                      </div>

                      {}
                      {event.sponsor && (
                        <div className="clay-card p-4 bg-mustard/15">
                          <p className="text-xs text-mustard-500 flex items-center space-x-2">
                            <span className="font-medium">Sponsored by:</span>
                            <span>{event.sponsor}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {}
                  <button
                    onClick={() => {
                      setExpandedEvents(prev => 
                        prev.includes(event.id)
                          ? prev.filter(id => id !== event.id)
                          : [...prev, event.id]
                      )
                    }}
                    className="w-full h-10 text-sm text-espresso/55 hover:text-espresso mt-4 mb-4 flex items-center justify-center space-x-1"
                  >
                    <span>{expandedEvents.includes(event.id) ? 'See Less' : 'See More'}</span>
                  </button>

                  {}
                  <div className="flex space-x-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRegister(event.id, event.is_registered)}
                      disabled={isLoadingAction}
                      className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 ${
                        event.is_registered
                          ? 'bg-cream-300 text-espresso hover:bg-cream-300'
                          : 'bg-forest text-white hover:bg-forest-400'
                      }`}
                    >
                      {isLoadingAction ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>{event.is_registered ? 'Registered' : 'Register Now'}</span>
                      )}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {}
          {!isLoading && filteredEvents.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <Calendar className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-espresso/70 mb-2">
                No events found
              </h3>
              <p className="text-espresso/55">
                Try adjusting your search or filter criteria
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentEventsPage;