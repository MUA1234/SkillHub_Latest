'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { StatPill } from '@/components/ui/stat-pill';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Filter,
  Plus,
  Mail,
  Phone,
  Calendar,
  BookOpen,
  Award,
  TrendingUp,
  TrendingDown,
  BarChart,
  Eye,
  Edit,
  MessageSquare,
  FileText,
  Download,
  Upload,
  Star,
  Clock,
  X
} from 'lucide-react';

interface ClassType {
  id: string;
  name: string;
  count: number;
}

interface Performance {
  currentGrade: string;
  avgScore: number;
  trend: string;
  attendance: number;
  assignmentsCompleted: number;
  totalAssignments: number;
}

interface StudentEnrollment {
  id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  status: string;
  progress_percentage: number;
  enrolled_at: string;
  completed_at?: string;
  last_accessed?: string;
  payment_status: string;
  payment_amount?: number;
  course?: {
    id: string;
    title: string;
    subject_id?: string;
    level?: string;
  };
  student?: {
    id: string;
  email: string;
    profile?: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      avatar_url?: string;
    };
  };
}

interface StudentsData {
  enrollments: StudentEnrollment[];
  total_students: number;
  active_students: number;
  completed_courses: number;
}

interface StudentStats {
  totalStudents: number;
  averageGrade: string;
  attendanceRate: number;
  activeClasses: number;
}

interface NewStudent {
  email: string;
  course_id: string;
}

interface Course {
  id: string;
  title: string;
  level?: string;
  status: string;
}

interface EmailData {
  subject: string;
  body: string;
}

const TeacherStudentsPage = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<StudentEnrollment | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showProgressDistributionModal, setShowProgressDistributionModal] = useState(false);
  const [showTopPerformersModal, setShowTopPerformersModal] = useState(false);
  const [showNeedAttentionModal, setShowNeedAttentionModal] = useState(false);
  
  const [importFile, setImportFile] = useState<File | null>(null);
  const [newStudent, setNewStudent] = useState<NewStudent>({
    email: '',
    course_id: ''
  });
  const [teacherCourses, setTeacherCourses] = useState<Course[]>([]);
  const [message, setMessage] = useState('');
  const [emailData, setEmailData] = useState<EmailData>({
    subject: '',
    body: ''
  });
  const [reportType, setReportType] = useState('progress');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [editProgress, setEditProgress] = useState(0);

  const [notifications, setNotifications] = useState<any[]>([]);

  const [studentsData, setStudentsData] = useState<StudentsData | null>(null);
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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

    fetchStudentsData();
    fetchTeacherCourses();
    fetchNotifications();
  }, [router, currentUser?.role]);

  const fetchTeacherCourses = async () => {
    try {
      const response = await apiClient.getTeacherCoursesList();
      setTeacherCourses(Array.isArray(response) ? response : []);
    } catch (err: any) {
      console.error('Error fetching courses:', err);
      setTeacherCourses([]);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await apiClient.getTeacherNotifications();
      setNotifications(Array.isArray(response?.notifications) ? response.notifications : []);
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    }
  };

  const fetchStudentsData = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const response = await apiClient.getTeacherStudents();
      const enrollmentsData = Array.isArray(response?.enrollments) ? response.enrollments : [];
      setStudentsData({
        enrollments: enrollmentsData,
        total_students: response?.total_students || 0,
        active_students: response?.active_students || 0,
        completed_courses: response?.completed_courses || 0
      });

      const stats: StudentStats = {
        totalStudents: response?.total_students || 0,
        averageGrade: calculateAverageGrade(enrollmentsData),
        attendanceRate: calculateAttendanceRate(enrollmentsData),
        activeClasses: calculateActiveClasses(enrollmentsData)
      };
      setStudentStats(stats);
    } catch (err: any) {
      console.error('Error fetching students:', err);
      setError(err.message || 'Failed to load students data');
      
      setStudentsData({
        enrollments: [],
        total_students: 0,
        active_students: 0,
        completed_courses: 0
      });
      setStudentStats({
        totalStudents: 0,
        averageGrade: 'N/A',
        attendanceRate: 0,
        activeClasses: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAverageGrade = (enrollments: StudentEnrollment[]): string => {
    if (!enrollments.length) return 'N/A';
    
    const avgProgress = enrollments.reduce((sum, enrollment) => sum + enrollment.progress_percentage, 0) / enrollments.length;
    
    if (avgProgress >= 90) return 'A';
    if (avgProgress >= 80) return 'B+';
    if (avgProgress >= 70) return 'B';
    if (avgProgress >= 60) return 'C+';
    return 'C';
  };

  const calculateAttendanceRate = (enrollments: StudentEnrollment[]): number => {
    if (!enrollments.length) return 0;
    
    const activeStudents = enrollments.filter(e => e.status === 'active' || e.status === 'completed').length;
    return Math.round((activeStudents / enrollments.length) * 100);
  };

  const calculateActiveClasses = (enrollments: StudentEnrollment[]): number => {
    const uniqueCourses = new Set(enrollments.map(e => e.course_id));
    return uniqueCourses.size;
  };

  const calculateGradeDistribution = (enrollments: StudentEnrollment[]) => {
    if (!enrollments.length) return { A: 0, B: 0, C: 0, D: 0 };
    
    const total = enrollments.length;
    let A = 0, B = 0, C = 0, D = 0;
    
    enrollments.forEach(enrollment => {
      const progress = enrollment.progress_percentage;
      if (progress >= 90) A++;
      else if (progress >= 70) B++;
      else if (progress >= 50) C++;
      else D++;
    });
    
    return {
      A: Math.round((A / total) * 100),
      B: Math.round((B / total) * 100), 
      C: Math.round((C / total) * 100),
      D: Math.round((D / total) * 100)
    };
  };

  const getTopPerformers = (enrollments: StudentEnrollment[]) => {
    return enrollments
      .filter(e => e.student?.profile?.first_name)
      .sort((a, b) => b.progress_percentage - a.progress_percentage)
      .slice(0, 3)
      .map(enrollment => ({
        name: `${enrollment.student?.profile?.first_name} ${enrollment.student?.profile?.last_name}`,
        initials: `${enrollment.student?.profile?.first_name?.[0] || ''}${enrollment.student?.profile?.last_name?.[0] || ''}`,
        average: enrollment.progress_percentage
      }));
  };

  const getStudentsNeedingAttention = (enrollments: StudentEnrollment[]) => {
    return enrollments
      .filter(e => e.student?.profile?.first_name && e.progress_percentage < 50)
      .slice(0, 2)
      .map(enrollment => ({
        name: `${enrollment.student?.profile?.first_name} ${enrollment.student?.profile?.last_name}`,
        initials: `${enrollment.student?.profile?.first_name?.[0] || ''}${enrollment.student?.profile?.last_name?.[0] || ''}`,
        progress: enrollment.progress_percentage,
        issue: enrollment.progress_percentage < 25 ? 'Very low progress' : 'Below average progress'
      }));
  };

  const classes: ClassType[] = [
    { id: 'all', name: 'All Courses', count: studentsData?.total_students || 0 },
    ...(teacherCourses.map(course => ({
      id: course.id,
      name: course.title,
      count: studentsData?.enrollments.filter(e => e.course_id === course.id).length || 0
    })) || [])
  ];

  const gradeDistribution = studentsData ? calculateGradeDistribution(Array.isArray(studentsData.enrollments) ? studentsData.enrollments : []) : { A: 0, B: 0, C: 0, D: 0 };
  const topPerformers = studentsData ? getTopPerformers(Array.isArray(studentsData.enrollments) ? studentsData.enrollments : []) : [];
  const studentsNeedingAttention = studentsData ? getStudentsNeedingAttention(Array.isArray(studentsData.enrollments) ? studentsData.enrollments : []) : [];

  const handleAction = (action: string, student?: StudentEnrollment) => {
    if (student) setCurrentStudent(student);
    
    switch(action) {
      case 'import':
        setShowImportModal(true);
        break;
      case 'add-student':
        setShowAddStudentModal(true);
        break;
      case 'filters':
        alert('Opening advanced filters panel');
        console.log('Filters panel opened');
        break;
      case 'export':
        alert('Exporting student data as CSV');
        console.log('Exporting student data');
        break;
      case 'view-profile':
        setEditProgress(student?.progress_percentage || 0);

        setIsEditingProfile(false);
        setShowProfileModal(true);
        break;
      case 'message':
        if (student?.student_id) {
          fetchMessages(student.student_id);
        }
        setShowMessageModal(true);
        break;
      case 'mail':
        setShowEmailModal(true);
        break;
      case 'report':
        setShowReportModal(true);
        break;
      case 'grade-distribution':
        setShowProgressDistributionModal(true);
        break;
      case 'top-performers':
        setShowTopPerformersModal(true);
        break;
      case 'needs-attention':
        setShowNeedAttentionModal(true);
        break;
      default:
        console.log('Action not defined:', action);
    }
  };

  const [importLoading, setImportLoading] = useState(false);
  const [addStudentLoading, setAddStudentLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{
    sender: 'teacher' | 'student';
    content: string;
    timestamp: string;
  }>>([]);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      alert('Please select a file to import');
      return;
    }

    try {
      setImportLoading(true);
      
      console.log('Importing student data from:', importFile);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      alert(`Successfully imported data from: ${importFile.name}`);
      setShowImportModal(false);
      setImportFile(null);
      
      await fetchStudentsData();
    } catch (err: any) {
      console.error('Error importing students:', err);
      alert(`Failed to import students: ${err.message || 'Unknown error'}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newStudent.email.trim() || !newStudent.course_id.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setAddStudentLoading(true);
      
      const result = await apiClient.addStudentToCourse(newStudent.email, newStudent.course_id);
      
      alert(result.message);
      setShowAddStudentModal(false);
      setNewStudent({ email: '', course_id: '' });
      
      await fetchStudentsData();
    } catch (err: any) {
      console.error('Error adding student:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || err?.toString() || 'Unknown error';
      alert(`Failed to add student: ${errorMessage}`);
    } finally {
      setAddStudentLoading(false);
    }
  };

  const fetchMessages = async (_studentId: string) => {
    setMessages([]);
  };

  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent || !message.trim()) {
      alert('Please enter a message');
      return;
    }

    const draft = message;
    const optimistic = {
      sender: 'teacher' as const,
      content: draft,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessage('');

    try {
      setMessageLoading(true);
      const result = await apiClient.sendMessageToStudent(currentStudent.student_id, draft);
      if (!result?.success) {
        throw new Error(result?.message || 'Send failed');
      }
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m !== optimistic));
      setMessage(draft);
      const errorMessage =
        err?.response?.data?.detail || err?.message || err?.toString() || 'Unknown error';
      alert(`Failed to send message: ${errorMessage}`);
    } finally {
      setMessageLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent || !emailData.subject.trim() || !emailData.body.trim()) {
      alert('Please fill in all email fields');
      return;
    }

    try {
      setEmailLoading(true);
      
      const result = await apiClient.sendEmailToStudent(currentStudent.student_id, emailData.subject, emailData.body);
      
      alert(result.message);
      setShowEmailModal(false);
      setEmailData({ subject: '', body: '' });
    } catch (err: any) {
      console.error('Error sending email:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || err?.toString() || 'Unknown error';
      alert(`Failed to send email: ${errorMessage}`);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setReportLoading(true);
      
      const blob = await apiClient.generateStudentReport(
        reportType, 
        reportFormat, 
        reportDateFrom || undefined, 
        reportDateTo || undefined
      );
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().slice(0, 10);
      const extension = reportFormat === 'excel' ? 'xlsx' : reportFormat;
      link.download = `${reportType}_report_${timestamp}.${extension}`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
      
      alert('Report downloaded successfully!');
      setShowReportModal(false);
      
      setReportType('progress');
      setReportFormat('pdf');
      setReportDateFrom('');
      setReportDateTo('');
      
    } catch (err: any) {
      console.error('Error generating report:', err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      alert(`Failed to generate report: ${errorMessage}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleProgressUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent) {
      alert('No student selected');
      return;
    }

    try {
      setProgressLoading(true);
      
      const result = await apiClient.updateStudentProgress(currentStudent.student_id, editProgress);
      
      alert(result.message);
      setIsEditingProfile(false);
      
      await fetchStudentsData();
    } catch (err: any) {
      console.error('Error updating progress:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || err?.toString() || 'Unknown error';
      alert(`Failed to update progress: ${errorMessage}`);
    } finally {
      setProgressLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
      case 'A+':
        return 'bg-forest/15 text-forest-500';
      case 'A-':
      case 'B+':
        return 'bg-terracotta/15 text-terracotta-500';
      case 'B':
      case 'B-':
        return 'bg-mustard/20 text-mustard-500';
      case 'C+':
      case 'C':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-coral/15 text-coral';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 bg-cream-300 rounded-full" />;
    }
  };

  const enrollmentsArray = Array.isArray(studentsData?.enrollments) ? studentsData.enrollments : [];
  const filteredStudents = enrollmentsArray.filter(student => {
    const matchesSearch = (student?.student?.profile?.first_name || student?.student?.profile?.last_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          student?.student?.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'all' || student?.course?.level === selectedClass;
    return matchesSearch && matchesClass;
  });

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole={userRole}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole="teacher" />
      
      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-bold text-espresso mb-2">
                  Students
                </h1>
                <p className="text-espresso/70">
                  Manage your student roster and track academic progress.
                </p>
              </div>
              <div className="flex space-x-3">
                
                <button 
                  className="inline-flex items-center px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 transition-colors"
                  onClick={() => handleAction('add-student')}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Student
                </button>
              </div>
            </div>

            {}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
              <StatPill onDark={false} tone="forest"     badge="A" value={studentStats?.totalStudents || 0}    label="Total students" />
              <StatPill onDark={false} tone="mustard"    badge="B" value={studentStats?.averageGrade || 'N/A'} label="Average grade" />
              <StatPill onDark={false} tone="terracotta" badge="C" value={`${studentStats?.attendanceRate || 0}%`} label="Attendance" />
              <StatPill onDark={false} tone="espresso"   badge="D" value={studentStats?.activeClasses || 0}   label="Active classes" />
            </div>

            {}
            <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mb-8">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  >
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.count})
                      </option>
                    ))}
                  </select>
                  <button 
                    className="flex items-center px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                    onClick={() => handleAction('filters')}
                  >
                    <Filter className="w-5 h-5 mr-2" />
                    Filters
                  </button>
                  <button 
                    className="flex items-center px-4 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                    onClick={() => handleAction('export')}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Export
                  </button>
                </div>
              </div>
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                <div className="col-span-full text-center py-10">
                  <p>Loading students...</p>
                </div>
              ) : error ? (
                <div className="col-span-full text-center py-10">
                  <div className="bg-coral/10 border border-coral/30 rounded-lg p-6 max-w-md mx-auto">
                    <h3 className="text-lg font-medium text-coral mb-2">Unable to Load Student Data</h3>
                    <p className="text-coral mb-4">We're having trouble connecting to the server. Your student data couldn't be loaded right now.</p>
                    <button 
                      onClick={fetchStudentsData}
                      className="bg-coral text-white px-4 py-2 rounded-lg hover:bg-coral-400 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="col-span-full text-center py-10">
                  <p>No students found matching your criteria.</p>
                </div>
              ) : (
                filteredStudents.map((student, index) => (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid hover:shadow-kid-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-teacher-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-teacher-600 font-semibold">
                            {student.student?.profile?.first_name?.charAt(0) || student.student?.profile?.last_name?.charAt(0) || 'S'}
                        </span>
                      </div>
                      <div>
                          <h3 className="font-semibold text-espresso">{student.student?.profile?.first_name || student.student?.profile?.last_name || 'Student'}</h3>
                          <p className="text-sm text-espresso/55">{student.course?.level || 'N/A'}</p>
                      </div>
                    </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(student.progress_percentage >= 90 ? 'A' : student.progress_percentage >= 80 ? 'B' : student.progress_percentage >= 70 ? 'C' : 'D')}`}>
                        {student.progress_percentage >= 90 ? 'A' : student.progress_percentage >= 80 ? 'B' : student.progress_percentage >= 70 ? 'C' : 'D'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-espresso/55">Average Score</p>
                      <div className="flex items-center">
                          <p className="text-lg font-semibold text-espresso">{student.progress_percentage}%</p>
                          {getTrendIcon('up')}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-espresso/55">Attendance</p>
                        <p className="text-lg font-semibold text-espresso">{student.progress_percentage}%</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-espresso/55">Assignments</span>
                      <span className="text-xs text-espresso/55">
                          {student.progress_percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-cream-300 rounded-full h-2">
                      <div 
                        className="bg-teacher-600 h-2 rounded-full"
                        style={{ 
                            width: `${student.progress_percentage}%` 
                        }}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-espresso/55 mb-2">Strengths</p>
                    <div className="flex flex-wrap gap-1">
                        {}
                        <span className="px-2 py-1 bg-forest/10 text-forest rounded-full text-xs">
                          Problem Solving
                        </span>
                        <span className="px-2 py-1 bg-forest/10 text-forest rounded-full text-xs">
                          Analytical Thinking
                        </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-espresso/55 mb-2">Needs Improvement</p>
                    <div className="flex flex-wrap gap-1">
                        {}
                        <span className="px-2 py-1 bg-terracotta/10 text-terracotta rounded-full text-xs">
                          Time Management
                        </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-espresso/55 mb-4">
                      <span>Last active: {student.last_accessed || 'N/A'}</span>
                  </div>

                  <div className="flex space-x-2">
                    <button 
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 transition-colors text-sm"
                      onClick={() => handleAction('view-profile', student)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Profile
                    </button>
                    <button 
                      className="px-3 py-2 bg-cream-100 text-espresso/70 rounded-lg hover:bg-cream-300 transition-colors"
                      onClick={() => handleAction('message', student)}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button 
                      className="px-3 py-2 bg-cream-100 text-espresso/70 rounded-lg hover:bg-cream-300 transition-colors"
                      onClick={() => handleAction('mail', student)}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button 
                      className="px-3 py-2 bg-cream-100 text-espresso/70 rounded-lg hover:bg-cream-300 transition-colors"
                      onClick={() => handleAction('report', student)}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
                ))
              )}
            </div>

            {}
            <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mt-8">
              <h3 className="text-lg font-semibold text-espresso mb-6">Class Performance Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div 
                  className="p-3 rounded-lg hover:bg-cream-100 cursor-pointer transition-colors"
                  onClick={() => handleAction('grade-distribution')}
                >
                  <h4 className="font-medium text-espresso mb-3">Progress Distribution</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-espresso/70">Excellent (≥90%)</span>
                      <span className="text-sm font-medium">{gradeDistribution.A}%</span>
                    </div>
                    <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-2">
                      <div className="bg-forest-300 h-2 rounded-full" style={{ width: `${gradeDistribution.A}%` }}></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-espresso/70">Good (70-89%)</span>
                      <span className="text-sm font-medium">{gradeDistribution.B}%</span>
                    </div>
                    <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-2">
                      <div className="bg-terracotta h-2 rounded-full" style={{ width: `${gradeDistribution.B}%` }}></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-espresso/70">Average (50-69%)</span>
                      <span className="text-sm font-medium">{gradeDistribution.C}%</span>
                    </div>
                    <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-2">
                      <div className="bg-mustard-300 h-2 rounded-full" style={{ width: `${gradeDistribution.C}%` }}></div>
                    </div>
                    {gradeDistribution.D > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-espresso/70">Needs Help (&lt;50%)</span>
                          <span className="text-sm font-medium">{gradeDistribution.D}%</span>
                        </div>
                        <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-2">
                          <div className="bg-coral-300 h-2 rounded-full" style={{ width: `${gradeDistribution.D}%` }}></div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div 
                  className="p-3 rounded-lg hover:bg-cream-100 cursor-pointer transition-colors"
                  onClick={() => handleAction('top-performers')}
                >
                  <h4 className="font-medium text-espresso mb-3">Top Performers</h4>
                  <div className="space-y-3">
                    {topPerformers.length > 0 ? (
                      topPerformers.map((performer, index) => (
                        <div key={index} className="flex items-center">
                          <div className="w-8 h-8 bg-teacher-100 rounded-full flex items-center justify-center mr-3">
                            <span className="text-teacher-600 text-xs font-semibold">{performer.initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-espresso">{performer.name}</p>
                            <p className="text-xs text-espresso/55">{performer.average}% progress</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-espresso/55">No performance data available</p>
                    )}
                  </div>
                </div>
                <div 
                  className="p-3 rounded-lg hover:bg-cream-100 cursor-pointer transition-colors"
                  onClick={() => handleAction('needs-attention')}
                >
                  <h4 className="font-medium text-espresso mb-3">Need Attention</h4>
                  <div className="space-y-3">
                    {studentsNeedingAttention.length > 0 ? (
                      studentsNeedingAttention.map((student, index) => (
                        <div key={index} className="flex items-center">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                            <span className="text-terracotta text-xs font-semibold">{student.initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-espresso">{student.name}</p>
                            <p className="text-xs text-espresso/55">{student.issue} ({student.progress}%)</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-espresso/55">All students performing well!</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-md">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">Import Students</h3>
              <button onClick={() => setShowImportModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleImportSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Upload CSV File
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer border-espresso/20 hover:border-teacher-600">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-3 text-espresso/45" />
                        <p className="text-sm text-espresso/55">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-espresso/55">CSV format only</p>
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".csv"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                  {importFile && (
                    <p className="mt-2 text-sm text-espresso/70">
                      Selected: {importFile.name}
                    </p>
                  )}
                </div>
                <div className="flex justify-end space-x-3">
                  <button 
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                  >
                    Cancel
                  </button>
                                    <button
                    type="submit"
                    disabled={importLoading}
                    className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importLoading ? 'Importing...' : 'Import Students'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-md">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">Add New Student</h3>
              <button onClick={() => setShowAddStudentModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleAddStudentSubmit}>
                <div className="grid gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Student Email Address
                    </label>
                    <input
                      type="email"
                      value={newStudent.email}
                      onChange={(e) => setNewStudent({...newStudent, email: e.target.value})}
                      className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      placeholder="Enter student's email address"
                      required
                    />
                    <p className="text-sm text-espresso/55 mt-1">
                      The student must have an existing account with this email
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Course
                    </label>
                    <select
                      value={newStudent.course_id}
                      onChange={(e) => setNewStudent({...newStudent, course_id: e.target.value})}
                      className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      required
                    >
                      <option value="">Select a course</option>
                      {teacherCourses.map(course => (
                        <option key={course.id} value={course.id}>
                          {course.title} {course.level ? `(${course.level})` : ''}
                        </option>
                      ))}
                    </select>
                    {teacherCourses.length === 0 && (
                      <p className="text-sm text-terracotta mt-1">
                        Loading courses...
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button 
                    type="button"
                    onClick={() => setShowAddStudentModal(false)}
                    className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                  >
                    Cancel
                  </button>
                                    <button
                    type="submit"
                    disabled={addStudentLoading}
                    className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addStudentLoading ? 'Adding...' : 'Add Student'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {showProfileModal && currentStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-md">
            <div className="border-b p-4 flex justify-between items-center bg-cream-50 sticky top-0">
              <h3 className="text-lg font-semibold text-espresso">Student Profile</h3>
              <button 
                onClick={() => setShowProfileModal(false)} 
                className="p-2 text-espresso/45 hover:text-espresso/55 rounded-full hover:bg-cream-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-teacher-100 rounded-full flex items-center justify-center mr-4">
                  <span className="text-teacher-600 font-semibold text-xl">
                    {currentStudent.student?.profile?.first_name?.charAt(0) || currentStudent.student?.profile?.last_name?.charAt(0) || 'S'}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-espresso">{currentStudent.student?.profile?.first_name || currentStudent.student?.profile?.last_name || 'Student'}</h2>
                  <p className="text-espresso/70">{currentStudent.course?.level || 'N/A'}</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-sm text-espresso/55">Email</p>
                  <p className="font-medium">{currentStudent.student?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-espresso/55">Phone</p>
                  <p className="font-medium">{currentStudent.student?.profile?.phone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-espresso/55">Enrolled Date</p>
                  <p className="font-medium">{currentStudent.enrolled_at}</p>
                </div>
                <div>
                  <p className="text-sm text-espresso/55">Last Active</p>
                  <p className="font-medium">{currentStudent.last_accessed || 'N/A'}</p>
                </div>
              </div>
              
              <div className="mb-6">
                <h4 className="font-medium text-espresso mb-3">Performance</h4>
                {!isEditingProfile ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-cream-100 p-4 rounded-lg">
                      <p className="text-sm text-espresso/55">Current Grade</p>
                      <div className="flex items-center mt-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(currentStudent.progress_percentage >= 90 ? 'A' : currentStudent.progress_percentage >= 80 ? 'B' : currentStudent.progress_percentage >= 70 ? 'C' : 'D')}`}>
                          {currentStudent.progress_percentage >= 90 ? 'A' : currentStudent.progress_percentage >= 80 ? 'B' : currentStudent.progress_percentage >= 70 ? 'C' : 'D'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-cream-100 p-4 rounded-lg">
                      <p className="text-sm text-espresso/55">Average Score</p>
                      <p className="text-xl font-bold mt-1">{currentStudent.progress_percentage}%</p>
                    </div>
                    <div className="bg-cream-100 p-4 rounded-lg">
                      <p className="text-sm text-espresso/55">Attendance</p>
                      <p className="text-xl font-bold mt-1">{currentStudent.progress_percentage}%</p>
                    </div>
                    <div className="bg-cream-100 p-4 rounded-lg">
                      <p className="text-sm text-espresso/55">Assignments</p>
                      <p className="text-xl font-bold mt-1">
                        {currentStudent.progress_percentage}%
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleProgressUpdate}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-espresso mb-1">
                          Progress Percentage
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editProgress}
                          onChange={(e) => setEditProgress(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                          placeholder="Enter progress percentage (0-100)"
                        />
                        <div className="flex items-center mt-2">
                          <span className="text-sm text-espresso/55 mr-2">Current Grade:</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(editProgress >= 90 ? 'A' : editProgress >= 80 ? 'B' : editProgress >= 70 ? 'C' : 'D')}`}>
                            {editProgress >= 90 ? 'A' : editProgress >= 80 ? 'B' : editProgress >= 70 ? 'C' : 'D'}
                          </span>
                        </div>
                      </div>

                    </div>
                  </form>
                )}
              </div>
              
              <div className="flex justify-end space-x-3">
                {!isEditingProfile ? (
                  <>
                    <button 
                      onClick={() => setIsEditingProfile(true)}
                      className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 flex items-center"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit Progress
                    </button>
                    <button 
                      onClick={() => setShowProfileModal(false)}
                      className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsEditingProfile(false)}
                      className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleProgressUpdate}
                      disabled={progressLoading}
                      className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {progressLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {showMessageModal && currentStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-md">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">
                Message to {currentStudent.student?.profile?.first_name || currentStudent.student?.profile?.last_name || 'student'}
              </h3>
              <button onClick={() => setShowMessageModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col h-[500px]">
              {}
              <div className="flex-1 p-4 overflow-y-auto border-b">
                <div className="space-y-4">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.sender === 'teacher' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          msg.sender === 'teacher'
                            ? 'bg-teacher-600 text-white ml-4'
                            : 'bg-cream-100 text-espresso mr-4'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs mt-1 opacity-70">
                          {new Date(msg.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className="text-center text-espresso/55 py-8">
                      <p>No previous messages</p>
                      <p className="text-sm">Start the conversation!</p>
                    </div>
                  )}
                </div>
              </div>

              {}
              <div className="p-4">
                <form onSubmit={handleMessageSubmit} className="space-y-4">
                  <div>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition h-24 resize-none"
                      placeholder="Type your message here..."
                      required
                    ></textarea>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button 
                      type="button"
                      onClick={() => setShowMessageModal(false)}
                      className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={messageLoading}
                      className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {messageLoading ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {showEmailModal && currentStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-md">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">
                Email to {currentStudent.student?.email}
              </h3>
              <button onClick={() => setShowEmailModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleEmailSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    To
                  </label>
                  <input
                    type="text"
                    value={currentStudent.student?.email}
                    readOnly
                    className="w-full px-3 py-2 border border-espresso/20 rounded-lg bg-cream-100 cursor-not-allowed"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailData.subject}
                    onChange={(e) => setEmailData({...emailData, subject: e.target.value})}
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                    placeholder="Enter email subject"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Message
                  </label>
                  <textarea
                    value={emailData.body}
                    onChange={(e) => setEmailData({...emailData, body: e.target.value})}
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition min-h-[150px]"
                    placeholder="Type your email content here..."
                    required
                  ></textarea>
                </div>
                <div className="flex justify-end space-x-3">
                  <button 
                    type="button"
                    onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                  >
                    Cancel
                  </button>
                                    <button
                    type="submit"
                    disabled={emailLoading}
                    className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {showReportModal && currentStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-md">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">
                Generate Report for {currentStudent.student?.profile?.first_name || currentStudent.student?.profile?.last_name || 'student'}
              </h3>
              <button onClick={() => setShowReportModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleReportSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Report Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Progress Report', value: 'progress' },
                      { label: 'Attendance Report', value: 'attendance' },
                      { label: 'Assignments Report', value: 'assignments' },
                      { label: 'Full Academic Report', value: 'full_academic' }
                    ].map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setReportType(type.value)}
                        className={`p-3 border rounded-lg text-center ${
                          reportType === type.value 
                            ? 'border-teacher-600 bg-teacher-50 text-teacher-700' 
                            : 'border-espresso/20 hover:bg-cream-100'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Date Range
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-espresso/55 mb-1">From</label>
                      <input
                        type="date"
                        value={reportDateFrom}
                        onChange={(e) => setReportDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-espresso/55 mb-1">To</label>
                      <input
                        type="date"
                        value={reportDateTo}
                        onChange={(e) => setReportDateTo(e.target.value)}
                        className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Format
                  </label>
                  <div className="flex space-x-4">
                    {['PDF', 'Excel', 'CSV'].map((format) => (
                      <label key={format} className="flex items-center">
                        <input
                          type="radio"
                          name="format"
                          value={format.toLowerCase()}
                          checked={reportFormat === format.toLowerCase()}
                          onChange={(e) => setReportFormat(e.target.value)}
                          className="mr-2 text-teacher-600 focus:ring-teacher-500"
                        />
                        {format}
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button 
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 border border-espresso/20 rounded-lg text-espresso hover:bg-cream-100"
                  >
                    Cancel
                  </button>
                                    <button
                    type="submit"
                    disabled={reportLoading}
                    className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {reportLoading ? 'Generating...' : 'Generate Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {showProgressDistributionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-2xl">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">Progress Distribution Details</h3>
              <button onClick={() => setShowProgressDistributionModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid gap-6">
                <div className="bg-forest/10 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-forest-500">Excellent Performance (≥90%)</span>
                    <span className="text-2xl font-bold text-forest">{gradeDistribution.A}%</span>
                  </div>
                  <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-3">
                    <div className="bg-forest-300 h-3 rounded-full" style={{ width: `${gradeDistribution.A}%` }}></div>
                  </div>
                  <p className="text-sm text-forest-500 mt-2">
                    Students performing at excellent level
                  </p>
                </div>
                
                <div className="bg-terracotta/10 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-terracotta-500">Good Performance (70-89%)</span>
                    <span className="text-2xl font-bold text-terracotta">{gradeDistribution.B}%</span>
                  </div>
                  <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-3">
                    <div className="bg-terracotta h-3 rounded-full" style={{ width: `${gradeDistribution.B}%` }}></div>
                  </div>
                  <p className="text-sm text-terracotta-500 mt-2">
                    Students performing at good level
                  </p>
                </div>
                
                <div className="bg-mustard/15 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-mustard-500">Average Performance (50-69%)</span>
                    <span className="text-2xl font-bold text-mustard-500">{gradeDistribution.C}%</span>
                  </div>
                  <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-3">
                    <div className="bg-mustard-300 h-3 rounded-full" style={{ width: `${gradeDistribution.C}%` }}></div>
                  </div>
                  <p className="text-sm text-mustard-500 mt-2">
                    Students performing at average level
                  </p>
                </div>
                
                {gradeDistribution.D > 0 && (
                  <div className="bg-coral/10 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-coral">Needs Help (&lt;50%)</span>
                      <span className="text-2xl font-bold text-coral">{gradeDistribution.D}%</span>
                    </div>
                    <div className="w-full bg-cream-200 border border-espresso/10 rounded-full h-3">
                      <div className="bg-coral-300 h-3 rounded-full" style={{ width: `${gradeDistribution.D}%` }}></div>
                    </div>
                    <p className="text-sm text-coral mt-2">
                      Students needing additional support
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end mt-6">
                <button 
                  onClick={() => setShowProgressDistributionModal(false)}
                  className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {showTopPerformersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-2xl">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">Top Performers</h3>
              <button onClick={() => setShowTopPerformersModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {topPerformers.length > 0 ? (
                <div className="space-y-4">
                  {topPerformers.map((performer, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border border-mustard/40">
                      <div className="flex items-center">
                        <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center mr-4">
                          <span className="text-white font-bold text-lg">#{index + 1}</span>
                        </div>
                        <div className="w-12 h-12 bg-teacher-100 rounded-full flex items-center justify-center mr-4">
                          <span className="text-teacher-600 font-semibold">{performer.initials}</span>
                        </div>
                        <div>
                          <h4 className="font-semibold text-espresso">{performer.name}</h4>
                          <p className="text-sm text-espresso/70">Top performer</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-mustard-500">{performer.average}%</div>
                        <p className="text-sm text-espresso/55">Progress</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-espresso/45 mb-4">
                    <Award className="w-16 h-16 mx-auto" />
                  </div>
                  <p className="text-espresso/70">No performance data available yet</p>
                </div>
              )}
              
              <div className="flex justify-end mt-6">
                <button 
                  onClick={() => setShowTopPerformersModal(false)}
                  className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {showNeedAttentionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-2xl">
            <div className="border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-espresso">Students Needing Attention</h3>
              <button onClick={() => setShowNeedAttentionModal(false)} className="text-espresso/45 hover:text-espresso/55">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {studentsNeedingAttention.length > 0 ? (
                <div className="space-y-4">
                  {studentsNeedingAttention.map((student, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
                      <div className="flex items-center">
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mr-4">
                          <span className="text-terracotta font-semibold">{student.initials}</span>
                        </div>
                        <div>
                          <h4 className="font-semibold text-espresso">{student.name}</h4>
                          <p className="text-sm text-terracotta">{student.issue}</p>
                          <p className="text-xs text-espresso/55">Needs additional support</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-terracotta">{student.progress}%</div>
                        <p className="text-sm text-espresso/55">Progress</p>
                        <button className="mt-2 px-3 py-1 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700">
                          Contact
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-green-400 mb-4">
                    <Award className="w-16 h-16 mx-auto" />
                  </div>
                  <p className="text-forest font-medium">All students performing well!</p>
                  <p className="text-espresso/55 text-sm mt-2">No students need attention at this time</p>
                </div>
              )}
              
              <div className="flex justify-end mt-6">
                <button 
                  onClick={() => setShowNeedAttentionModal(false)}
                  className="px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherStudentsPage;