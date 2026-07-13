'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Star, MessageCircle, Calendar, Users, Clock, MapPin, ChevronDown, X, Send, Eye } from 'lucide-react';
import Link from 'next/link';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from '@/hooks/use-translation';
import { formatCurrency } from '@/lib/format';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface Teacher {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  experience_years: number;
  hourly_rate: number;
  is_online_available: boolean;
  is_verified: boolean;
  total_students: number;
  total_reviews: number;
  average_rating: number;
  specializations: string[];
  languages: string[];
  teaching_style: string | null;
  response_time: string | null;
  availability_status: string;
  location: string | null;
  bio: string | null;
  primary_subject: string | null;
  all_subjects: string[];
}

interface Subject {
  id: string;
  name: string;
  description: string;
  category: string;
  teacher_count: number;
  course_count: number;
}

interface SearchFilters {
  search: string;
  subject: string;
  min_rating: number;
  max_rate: number;
  online_only: boolean;
  page: number;
  limit: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function FindTeachers() {
  const router = useRouter();
  const { language } = useTranslation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0
  });
  const [filters, setFilters] = useState<SearchFilters>({
    search: '',
    subject: '',
    min_rating: 0,
    max_rate: 0,
    online_only: false,
    page: 1,
    limit: 12
  });
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [contactForm, setContactForm] = useState({
    subject: 'General Inquiry',
    message: ''
  });
  const [bookingForm, setBookingForm] = useState({
    session_type: 'Individual Session',
    preferred_date: '',
    message: '',
  });
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }

    loadInitialData();
  }, [router, currentUser?.role]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchTeachers();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filters]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const subjectsResponse = await apiClient.getSubjectsForStudents();
      setSubjects(subjectsResponse.data);
      
      await searchTeachers(true);
    } catch (err: any) {
      console.error('Load initial data error:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const searchTeachers = async (isInitial = false) => {
    try {
      if (!isInitial) setIsSearching(true);
      setError('');

      const response = await apiClient.findTeachers(filters);
      
      setTeachers(response.data.teachers);
      setPagination(response.data.pagination);
    } catch (err: any) {
      console.error('Search teachers error:', err);
      setError(err.message || 'Failed to search teachers');
      setTeachers([]);
    } finally {
      if (!isInitial) setIsSearching(false);
    }
  };

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value
    }));
  };

  const handleContactTeacher = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowContactModal(true);
    setContactForm({
      subject: 'General Inquiry',
      message: ''
    });
  };

  const sendContactMessage = async () => {
    if (!selectedTeacher || !contactForm.message.trim()) return;

    try {
      const response = await apiClient.contactTeacher(
        selectedTeacher.id,
        contactForm.message,
        contactForm.subject
      );

      setShowContactModal(false);
      setContactForm({ subject: 'General Inquiry', message: '' });
      setSuccessMessage(`Your message has been sent to ${selectedTeacher.name}! They typically respond within ${selectedTeacher.response_time || 'a few hours'}.`);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Contact teacher error:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to send message';
      setError(`Failed to send message: ${errorMessage}`);
    }
  };

  const handleBookTeacher = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setBookingForm({
      session_type: 'Individual Session',
      preferred_date: '',
      message: '',
    });
    setShowBookingModal(true);
  };

  const sendBookingRequest = async () => {
    if (!selectedTeacher || submittingBooking) return;
    if (!bookingForm.preferred_date) {
      setError('Please pick a preferred date for the booking.');
      return;
    }
    setSubmittingBooking(true);
    setError('');
    try {
      const parts = [
        `Hi ${selectedTeacher.name}, I'd like to book a ${bookingForm.session_type.toLowerCase()} with you.`,
        `Preferred date: ${bookingForm.preferred_date}.`,
        bookingForm.message.trim()
          ? `\nNotes from me:\n${bookingForm.message.trim()}`
          : '',
      ].filter(Boolean);
      const composed = parts.join(' ').trim();

      await apiClient.contactTeacher(
        selectedTeacher.id,
        composed,
        `Booking request — ${bookingForm.session_type}`,
      );

      setShowBookingModal(false);
      setSuccessMessage(
        `Your booking request has been sent to ${selectedTeacher.name}. They'll reply via chat to confirm a time slot, then publish the session on your dashboard.`,
      );
      setShowSuccessModal(true);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.detail || err?.message || 'Failed to send booking request';
      setError(`Failed to send booking request: ${errorMessage}`);
    } finally {
      setSubmittingBooking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation 
          userRole={userRole as 'student' | 'teacher' | 'sponsor'}
          userName={userName}
          userEmail={userEmail}
        />
        <div className="flex pt-16">
          <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
          <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8">
            <div className="animate-pulse">
              <div className="h-8 bg-cream-300 rounded mb-6 w-1/3"></div>
              <div className="bg-cream-300 rounded-lg h-20 mb-8"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-cream-300 rounded-lg h-80"></div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      
      <div className="flex pt-16"> {}
        <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
        
        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" style={{ marginLeft: 'var(--sidebar-width, 16rem)' }}> {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <PageHeader
              className="mb-8"
              eyebrow="Network"
              title="Find your"
              accent="next favourite teacher"
              body="Real people who get how kids learn. Filter by subject, language, or accessibility specialization."
            />

            {error && (
              <div className="mb-6 bg-coral/15 border border-coral text-coral px-4 py-3 rounded">
                {error}
                <button 
                  onClick={loadInitialData}
                  className="ml-4 underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            )}

            {}
            <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {}
                <div className="lg:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 h-5 w-5" />
                    <input
                      type="text"
                      placeholder="Search teachers by name or specialization..."
                      value={filters.search}
                      onChange={(e) => updateFilter('search', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-espresso/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta"
                    />
                  </div>
                </div>
                
                {}
                <div className="relative">
                  <select
                    value={filters.subject}
                    onChange={(e) => updateFilter('subject', e.target.value)}
                    className="w-full appearance-none bg-cream-50 border border-espresso/20 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-terracotta"
                  >
                    <option value="">All Subjects</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.name}>
                        {subject.name} ({subject.teacher_count})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-espresso/45 h-5 w-5 pointer-events-none" />
                </div>

                {}
                <div className="flex items-center space-x-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.online_only}
                      onChange={(e) => updateFilter('online_only', e.target.checked)}
                      className="rounded border-espresso/20 text-terracotta focus:ring-terracotta"
                    />
                    <span className="ml-2 text-sm text-espresso">Online Only</span>
                  </label>
                </div>
              </div>

              {}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-espresso/15">
                <div>
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Minimum Rating
                  </label>
                  <select
                    value={filters.min_rating}
                    onChange={(e) => updateFilter('min_rating', parseFloat(e.target.value))}
                    className="w-full border border-espresso/20 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-terracotta"
                  >
                    <option value={0}>Any Rating</option>
                    <option value={3}>3+ Stars</option>
                    <option value={4}>4+ Stars</option>
                    <option value={4.5}>4.5+ Stars</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Max Hourly Rate (LKR)
                  </label>
                  <select
                    value={filters.max_rate}
                    onChange={(e) => updateFilter('max_rate', parseFloat(e.target.value))}
                    className="w-full border border-espresso/20 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-terracotta"
                  >
                    <option value={0}>Any Rate</option>
                    <option value={1500}>Under {formatCurrency(1500, { locale: language })}/hr</option>
                    <option value={3000}>Under {formatCurrency(3000, { locale: language })}/hr</option>
                    <option value={5000}>Under {formatCurrency(5000, { locale: language })}/hr</option>
                  </select>
                </div>
              </div>
            </div>

            {}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-espresso">
                  {isSearching ? 'Searching...' : `${pagination.total} Teachers Found`}
                </h2>
                <p className="text-sm text-espresso/70">
                  Page {pagination.page} of {pagination.pages}
                </p>
              </div>
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {teachers.map((teacher, index) => (
                <motion.div
                  key={teacher.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="relative">
                      <img
                        src={teacher.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=E97A3C&color=FAF1DD&size=64`}
                        alt={teacher.name}
                        className="w-16 h-16 rounded-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=E97A3C&color=FAF1DD&size=64`;
                        }}
                      />
                      <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-cream-50 ${
                        teacher.is_online_available ? 'bg-forest-300' : 'bg-espresso/30'
                      }`} />
                      {teacher.is_verified && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-terracotta rounded-full flex items-center justify-center">
                          <Users className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-espresso">{teacher.name}</h3>
                      <p className="text-espresso/70">{teacher.primary_subject || 'General'}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-400 fill-current" />
                          <span className="text-sm text-espresso/70 ml-1">
                            {teacher.average_rating ? teacher.average_rating.toFixed(1) : 'New'}
                          </span>
                        </div>
                        <span className="text-espresso/45">•</span>
                        <span className="text-sm text-espresso/70">
                          {teacher.experience_years}+ years
                        </span>
                      </div>
                    </div>
                  </div>

                  {teacher.specializations && teacher.specializations.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-espresso/70 mb-2">Specializations:</p>
                      <div className="flex flex-wrap gap-1">
                        {teacher.specializations.slice(0, 3).map((spec, i) => (
                          <span key={i} className="px-2 py-1 bg-terracotta/15 text-terracotta-500 rounded-full text-xs">
                            {spec}
                          </span>
                        ))}
                        {teacher.specializations.length > 3 && (
                          <span className="px-2 py-1 bg-cream-100 text-espresso/70 rounded-full text-xs">
                            +{teacher.specializations.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-xs text-espresso/70">
                    <div className="flex items-center">
                      <Users className="h-3 w-3 mr-1" />
                      {teacher.total_students} students
                    </div>
                    <div className="flex items-center">
                      <MessageCircle className="h-3 w-3 mr-1" />
                      {teacher.response_time || 'Quick'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span className="text-lg font-semibold text-espresso">
                      {formatCurrency(teacher.hourly_rate, { locale: language })}/hr
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      teacher.is_online_available 
                        ? 'bg-forest/15 text-forest-500' 
                        : 'bg-cream-100 text-espresso'
                    }`}>
                      {teacher.availability_status}
                    </span>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleBookTeacher(teacher)}
                      className="flex-1 bg-terracotta text-white px-4 py-2 rounded-lg hover:bg-terracotta-500 transition-colors flex items-center justify-center space-x-2"
                    >
                      <Calendar className="h-4 w-4" />
                      <span>Book Session</span>
                    </button>
                    <Link
                      href={`/students/find-teachers/${teacher.id}`}
                      className="px-4 py-2 border border-espresso/20 rounded-lg hover:bg-cream-100 transition-colors"
                      title="View Profile"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleContactTeacher(teacher)}
                      className="px-4 py-2 border border-espresso/20 rounded-lg hover:bg-cream-100 transition-colors"
                      title="Contact Teacher"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-center space-x-2">
                <button
                  onClick={() => updateFilter('page', pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-2 rounded-lg border border-espresso/20 text-espresso hover:bg-cream-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => updateFilter('page', page)}
                      className={`px-3 py-2 rounded-lg ${
                        pagination.page === page
                          ? 'bg-terracotta text-white'
                          : 'border border-espresso/20 text-espresso hover:bg-cream-100'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => updateFilter('page', pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="px-3 py-2 rounded-lg border border-espresso/20 text-espresso hover:bg-cream-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            {teachers.length === 0 && !isLoading && !isSearching && (
              <EmptyState
                illustration="empty-search"
                title="No teachers found"
                body="Try adjusting your search criteria or browse all subjects."
                actions={
                <button
                  onClick={() => setFilters({
                    search: '',
                    subject: '',
                    min_rating: 0,
                    max_rate: 0,
                    online_only: false,
                    page: 1,
                    limit: 12
                  })}
                  className="btn-kid-primary"
                >
                  Clear Filters
                </button>
                }
              />
            )}
          </motion.div>
        </main>
      </div>

      {}
      {showBookingModal && selectedTeacher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-lg p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Book Session with {selectedTeacher.name}
              </h3>
              <button
                onClick={() => setShowBookingModal(false)}
                className="text-espresso/45 hover:text-espresso/70"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-espresso mb-1">
                  Session Type
                </label>
                <select
                  value={bookingForm.session_type}
                  onChange={(e) =>
                    setBookingForm((f) => ({ ...f, session_type: e.target.value }))
                  }
                  className="w-full border border-espresso/20 rounded-lg px-3 py-2"
                >
                  <option>Individual Session</option>
                  <option>Group Session</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-1">
                  Preferred Date
                </label>
                <input
                  type="date"
                  value={bookingForm.preferred_date}
                  onChange={(e) =>
                    setBookingForm((f) => ({ ...f, preferred_date: e.target.value }))
                  }
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-espresso/20 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-1">
                  Message (optional)
                </label>
                <textarea
                  value={bookingForm.message}
                  onChange={(e) =>
                    setBookingForm((f) => ({ ...f, message: e.target.value }))
                  }
                  maxLength={1000}
                  className="w-full border border-espresso/20 rounded-lg px-3 py-2 h-20"
                  placeholder="Tell the teacher about your learning goals or specific topics you'd like to cover..."
                />
              </div>

              <div className="bg-terracotta/10 p-3 rounded-lg">
                <p className="text-sm text-terracotta-500">
                  <span className="font-medium">Rate:</span> {formatCurrency(selectedTeacher.hourly_rate, { locale: language })}/hr
                </p>
                <p className="text-sm text-terracotta mt-1">
                  Your request is delivered as a chat message. The teacher confirms a slot and the session shows up on your dashboard.
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowBookingModal(false)}
                  disabled={submittingBooking}
                  className="flex-1 border border-espresso/20 text-espresso px-4 py-2 rounded-lg hover:bg-cream-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendBookingRequest}
                  disabled={submittingBooking || !bookingForm.preferred_date}
                  className="flex-1 bg-terracotta text-white px-4 py-2 rounded-lg hover:bg-terracotta-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
                >
                  {submittingBooking ? 'Sending…' : 'Send Request'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {}
      {showContactModal && selectedTeacher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-lg w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">
                Contact {selectedTeacher.name}
              </h3>
              <button
                onClick={() => setShowContactModal(false)}
                className="text-espresso/45 hover:text-espresso/70"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {}
              <div className="flex items-center space-x-3 bg-cream-100 p-3 rounded-lg">
                <img
                  src={selectedTeacher.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedTeacher.name)}&background=E97A3C&color=FAF1DD&size=40`}
                  alt={selectedTeacher.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <p className="font-medium text-espresso">{selectedTeacher.name}</p>
                  <p className="text-sm text-espresso/70">{selectedTeacher.primary_subject}</p>
                  <p className="text-xs text-espresso/55">Usually responds in {selectedTeacher.response_time || 'a few hours'}</p>
                </div>
              </div>

              {}
              <div>
                <label className="block text-sm font-medium text-espresso mb-1">
                  Subject
                </label>
                <select
                  value={contactForm.subject}
                  onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full border border-espresso/20 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-terracotta"
                >
                  <option value="General Inquiry">General Inquiry</option>
                  <option value="Course Question">Course Question</option>
                  <option value="Schedule Discussion">Schedule Discussion</option>
                  <option value="Tutoring Request">Tutoring Request</option>
                  <option value="Technical Support">Technical Support</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-1">
                  Message
                </label>
                <textarea
                  value={contactForm.message}
                  onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full border border-espresso/20 rounded-lg px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-terracotta"
                  placeholder="Hi! I'm interested in learning more about your teaching style and availability. Could we discuss..."
                  required
                />
                <p className="text-xs text-espresso/55 mt-1">
                  Be specific about your learning goals and what you're looking for.
                </p>
              </div>

              <div className="bg-terracotta/10 p-3 rounded-lg">
                <p className="text-sm text-terracotta-500">
                  💡 <span className="font-medium">Tip:</span> Include your current level, specific topics you want to learn, and your preferred schedule.
                </p>
              </div>
            </div>

            <div className="flex space-x-3 p-6 border-t">
              <button
                onClick={() => setShowContactModal(false)}
                className="flex-1 border border-espresso/20 text-espresso px-4 py-2 rounded-lg hover:bg-cream-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendContactMessage}
                disabled={!contactForm.message.trim()}
                className="flex-1 bg-terracotta text-white px-4 py-2 rounded-lg hover:bg-terracotta-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send Message
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-lg w-full max-w-md mx-4 p-6"
          >
            <div className="text-center">
              {}
              <div className="mx-auto w-16 h-16 bg-forest/15 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h3 className="text-xl font-semibold text-espresso mb-2">
                Message Sent Successfully!
              </h3>

              <p className="text-espresso/70 mb-6">
                {successMessage}
              </p>

              <div className="bg-terracotta/10 p-4 rounded-lg mb-6 text-left">
                <p className="text-sm text-terracotta-500">
                  <span className="font-medium">What's next?</span>
                </p>
                <ul className="text-sm text-terracotta-500 mt-2 space-y-1">
                  <li>• Check your <strong>Chat with Teachers</strong> page for replies</li>
                  <li>• You'll receive a notification when they respond</li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="flex-1 border border-espresso/20 text-espresso px-4 py-2 rounded-lg hover:bg-cream-100 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    router.push('/students/chat');
                  }}
                  className="flex-1 bg-forest text-white px-4 py-2 rounded-lg hover:bg-forest-400 transition-colors"
                >
                  Go to Messages
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 