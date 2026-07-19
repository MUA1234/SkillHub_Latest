'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import {
  BookOpen,
  Users,
  DollarSign,
  Calendar,
  Video,
  MessageCircle,
  Star,
  Clock,
  Award,
  BarChart3,
  Plus,
  Play,
  Eye,
  Heart,
  Share,
  Loader
} from 'lucide-react';

interface DashboardData {
  stats: {
    total_students: number;
    monthly_earnings: number;
    active_courses: number;
    average_rating: number;
    total_teaching_hours?: number;
  };
  upcoming_sessions: Array<{
    id: string;
    title: string;
    students: number;
    time: string;
    date: string;
    type: string;
  }>;
  recent_students: Array<{
    id: string;
    name: string;
    course: string;
    progress: number;
    lastActive: string;
    avatar?: string;
    status: string;
  }>;
  course_performance: Array<{
    id: string;
    title: string;
    students: number;
    rating: number;
    completion: number;
    revenue: string;
  }>;
}

const TeacherHomePage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const userName = `${currentUser?.profile?.first_name || 'Teacher'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'teacher') {
      router.push('/auth');
      return;
    }

    fetchDashboardData();
  }, [router, currentUser?.role]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const [dashboardStats, sessionsData, studentsData, coursesData] = await Promise.all([
        apiClient.getTeacherProfile().catch(() => null),
        apiClient.getTeacherSessions().catch(() => ({ sessions: [] })),
        apiClient.getTeacherStudents().catch(() => ({ students: [] })),
        apiClient.getTeacherCourses().catch(() => ({ courses: [] }))
      ]);

      const stats = dashboardStats?.stats || {
        total_students: 0,
        monthly_earnings: 0,
        total_courses: 0,
        average_rating: 0,
        total_teaching_hours: 0
      };

      const sessions = sessionsData?.sessions || [];
      const upcomingSessions = sessions.slice(0, 3).map((session: any) => ({
        id: session.id,
        title: session.title,
        students: session.current_participants || 0,
        time: session.scheduled_start ? new Date(session.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD',
        date: session.scheduled_start ? formatDate(session.scheduled_start) : 'TBD',
        type: session.session_type || 'Live Session',
      }));

      // GET /teachers/students returns a flat `students` array (one row per
      // student, with a `courses` sub-array), not nested `enrollments` with
      // `.student.profile`/`.course` — this page always showed "No students
      // yet" regardless of real enrollments.
      const students = studentsData?.students || [];
      const recentStudents = students.slice(0, 3).map((student: any) => ({
        id: student.id,
        name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student',
        course: student.courses?.[0]?.title || 'Course',
        progress: student.average_progress || 0,
        lastActive: student.enrolled_at ? formatRelativeTime(student.enrolled_at) : 'N/A',
        avatar: student.avatar_url || null,
        status: student.average_progress < 50 ? 'needs_attention' : 'active'
      }));

      const courses = coursesData?.courses || [];
      const coursePerformance = courses.slice(0, 3).map((course: any) => ({
        id: course.id,
        title: course.title,
        students: course.total_students || 0,
        rating: course.average_rating || 0,
        completion: Math.round(course.completion_rate || 0),
        revenue: formatCurrency(course.total_revenue || 0, { locale: language, compact: true }),
      }));

      setDashboardData({
        stats: {
          total_students: stats.total_students || 0,
          monthly_earnings: stats.monthly_earnings || 0,
          active_courses: stats.total_courses || 0,
          average_rating: stats.average_rating || 0,
          total_teaching_hours: stats.total_teaching_hours || 0
        },
        upcoming_sessions: upcomingSessions,
        recent_students: recentStudents,
        course_performance: coursePerformance
      });
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  const teachingStats = dashboardData ? [
    { label: 'Active Students', value: formatNumber(dashboardData.stats.total_students, { locale: language }), icon: Users, color: 'text-terracotta' },
    { label: 'Monthly Earnings', value: formatCurrency(dashboardData.stats.monthly_earnings, { locale: language, compact: true }), icon: DollarSign, color: 'text-forest' },
    { label: 'Course Rating', value: dashboardData.stats.average_rating.toFixed(1), icon: Star, color: 'text-mustard-500' },
    { label: 'Hours Taught', value: (dashboardData.stats.total_teaching_hours || 0).toString(), icon: Clock, color: 'text-coral' },
  ] : [];

  const upcomingClasses = dashboardData?.upcoming_sessions || [];
  const recentStudents = dashboardData?.recent_students || [];
  const coursePerformance = dashboardData?.course_performance || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation
          userRole={userRole as 'student' | 'teacher' | 'sponsor'}
          userName={userName}
          userEmail={userEmail}
        />
        <DashboardSidebar userRole="teacher" />
        <div className="pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <Loader className="w-8 h-8 animate-spin text-terracotta mx-auto mb-4" />
                <p className="text-espresso/70">Loading dashboard...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation
          userRole={userRole as 'student' | 'teacher' | 'sponsor'}
          userName={userName}
          userEmail={userEmail}
        />
        <DashboardSidebar userRole="teacher" />
        <div className="pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-coral/15 border border-coral text-coral px-4 py-3 rounded">
              {error}
              <button
                onClick={fetchDashboardData}
                className="ml-4 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
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
      <DashboardSidebar userRole="teacher" />

      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <PageHeader title="Welcome to your" accent="studio" />
                <p className="text-espresso/70">
                  You have {upcomingClasses.length} sessions scheduled with {dashboardData?.stats.total_students || 0} students enrolled.
                </p>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push('/teachers/content')}
                className="clay-card bg-terracotta text-white px-6 py-3 flex items-center space-x-2 hover:bg-terracotta-500 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Create Course</span>
              </motion.button>
            </div>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            {teachingStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  whileHover={{ y: -5 }}
                  className="clay-card p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <Icon className={`w-8 h-8 ${stat.color}`} />
                  </div>
                  <div className="text-2xl font-bold text-espresso mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-espresso/70">
                    {stat.label}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            {}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-2"
            >
              <div className="clay-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-espresso">Today's Schedule</h2>
                  <button
                    onClick={() => router.push('/teachers/schedule')}
                    className="text-terracotta hover:text-terracotta-500 text-sm font-medium"
                  >
                    View Full Calendar
                  </button>
                </div>

                <div className="space-y-4">
                  {upcomingClasses.length > 0 ? (
                    upcomingClasses.map((session) => (
                      <motion.div
                        key={session.id}
                        whileHover={{ x: 5 }}
                        className="p-4 clay-card hover:shadow-lg transition-all border-l-4 border-terracotta"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-16 h-16 clay-card bg-terracotta/15 flex items-center justify-center flex-shrink-0">
                            <Video className="w-6 h-6 text-terracotta" />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-semibold text-espresso">
                                {session.title}
                              </h3>
                              <span className="text-xs font-medium text-terracotta bg-terracotta/15 px-2 py-1 rounded-full">
                                {session.type}
                              </span>
                            </div>

                            <div className="flex items-center space-x-4 text-sm text-espresso/70">
                              <span>{session.students} students</span>
                              <span>{session.time}</span>
                              <span>{session.date}</span>
                            </div>
                          </div>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => router.push('/teachers/live-sessions')}
                            className="bg-terracotta text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-terracotta-500 transition-colors flex items-center space-x-2"
                          >
                            <Video className="w-4 h-4" />
                            <span>Start</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Calendar className="w-12 h-12 text-espresso/30 mx-auto mb-3" />
                      <p className="text-espresso/55">No upcoming sessions</p>
                      <p className="text-sm text-espresso/45">Schedule a new session to get started</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="clay-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-espresso">Recent Students</h2>
                  <Users className="w-5 h-5 text-espresso/45" />
                </div>

                <div className="space-y-4">
                  {recentStudents.length > 0 ? (
                    recentStudents.map((student) => (
                      <motion.div
                        key={student.id}
                        whileHover={{ scale: 1.02 }}
                        className="p-4 clay-card"
                      >
                        <div className="flex items-center space-x-3 mb-3">
                          {student.avatar ? (
                            <img
                              src={student.avatar}
                              alt={student.name}
                              className="w-10 h-10 clay-card object-cover rounded-full"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-terracotta/15 rounded-full flex items-center justify-center">
                              <span className="text-terracotta font-semibold text-sm">
                                {student.name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="font-semibold text-espresso text-sm">
                              {student.name}
                            </h3>
                            <p className="text-xs text-espresso/70">{student.course}</p>
                          </div>
                          <div className={`w-3 h-3 rounded-full ${
                            student.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                          }`} />
                        </div>

                        <div className="flex items-center space-x-3">
                          <div className="flex-1">
                            <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-2">
                              <div
                                className="bg-terracotta h-2 rounded-full transition-all duration-500"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-espresso/55 mt-1">
                              {student.progress}% • {student.lastActive}
                            </p>
                          </div>

                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => router.push('/teachers/students')}
                            className="clay-card p-2 text-terracotta hover:text-terracotta-500"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-espresso/30 mx-auto mb-3" />
                      <p className="text-espresso/55">No students yet</p>
                      <p className="text-sm text-espresso/45">Students will appear here once enrolled</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8"
          >
            <div className="clay-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-espresso">Course Performance</h2>
                <button
                  onClick={() => router.push('/teachers/analytics')}
                  className="text-terracotta hover:text-terracotta-500 text-sm font-medium"
                >
                  View Analytics
                </button>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {coursePerformance.length > 0 ? (
                  coursePerformance.map((course) => (
                    <motion.div
                      key={course.id}
                      whileHover={{ y: -5 }}
                      className="clay-card p-6"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-espresso text-sm">
                          {course.title}
                        </h3>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-espresso/55">Students:</span>
                          <p className="font-medium text-espresso">{course.students}</p>
                        </div>
                        <div>
                          <span className="text-espresso/55">Rating:</span>
                          <p className="font-medium text-espresso">{course.rating}</p>
                        </div>
                        <div>
                          <span className="text-espresso/55">Completion:</span>
                          <p className="font-medium text-espresso">{course.completion}%</p>
                        </div>
                        <div>
                          <span className="text-espresso/55">Revenue:</span>
                          <p className="font-medium text-forest">{course.revenue}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-3 text-center py-8">
                    <BookOpen className="w-12 h-12 text-espresso/30 mx-auto mb-3" />
                    <p className="text-espresso/55">No courses yet</p>
                    <p className="text-sm text-espresso/45">Create a course to see performance metrics</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-8"
          >
            <h2 className="text-xl font-bold text-espresso mb-6">Quick Actions</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: 'Upload Content', icon: BookOpen, href: '/teachers/content', color: 'bg-terracotta' },
                { name: 'View Analytics', icon: BarChart3, href: '/teachers/analytics', color: 'bg-forest' },
                { name: 'Schedule Session', icon: Calendar, href: '/teachers/schedule', color: 'bg-coral-300' },
                { name: 'Message Students', icon: MessageCircle, href: '/teachers/messages', color: 'bg-mustard-400' }
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.name}
                    whileHover={{ y: -5, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => router.push(action.href)}
                    className={`${action.color} text-cream p-6 rounded-2xl text-center border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform`}
                  >
                    <Icon className="w-8 h-8 mx-auto mb-3" />
                    <span className="text-sm font-medium">{action.name}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default TeacherHomePage;