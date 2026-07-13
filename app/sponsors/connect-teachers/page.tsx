'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from '@/hooks/use-translation';
import { formatCurrency } from '@/lib/format';
import { getCurrentUser, isAuthenticated, apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { 
  Users,
  Mail,
  Phone,
  MapPin,
  Star,
  Award,
  BookOpen,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  MessageSquare,
  Eye,
  Filter,
  Search
} from 'lucide-react';

interface SponsorshipRequest {
  id: string;
  teacherName: string;
  teacherEmail: string;
  teacherPhone: string;
  school: string;
  location: string;
  rating: number;
  experience: string;
  projectTitle: string;
  projectDescription: string;
  amountRequested: number;
  studentsImpacted: number;
  submissionDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'under_review';
  category: string;
  urgency: 'low' | 'medium' | 'high';
}

const SponsorConnectTeachersPage = () => {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [sponsorshipRequests, setSponsorshipRequests] = useState<SponsorshipRequest[]>([]);
  const [summary, setSummary] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    totalStudents: 0,
    totalAmount: 0
  });

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'sponsor';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'sponsor') {
      router.push('/auth');
      return;
    }
    
    loadSponsorshipRequests();
  }, [router, currentUser?.role]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!loading) {
        loadSponsorshipRequests();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, statusFilter, categoryFilter]);

  const loadSponsorshipRequests = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiClient.getSponsorshipRequests({
        status_filter: statusFilter,
        category_filter: categoryFilter,
        search: searchQuery,
        page: 1,
        limit: 50
      });

      let requestsData: SponsorshipRequest[] = [];
      let summaryData = {
        totalRequests: 0,
        pendingRequests: 0,
        totalStudents: 0,
        totalAmount: 0
      };

      if (result?.success && result?.data) {
        requestsData = Array.isArray(result.data?.requests) ? result.data.requests : [];
        summaryData = result.data?.summary || summaryData;
      } else if (Array.isArray(result?.requests)) {
        requestsData = result.requests;
        summaryData = result.summary || summaryData;
      } else if (Array.isArray(result?.data)) {
        requestsData = result.data;
      } else if (Array.isArray(result)) {
        requestsData = result;
      }

      if (requestsData.length > 0 && summaryData.totalRequests === 0) {
        summaryData = {
          totalRequests: requestsData.length,
          pendingRequests: requestsData.filter(r => r.status === 'pending').length,
          totalStudents: requestsData.reduce((sum, r) => sum + (r.studentsImpacted || 0), 0),
          totalAmount: requestsData.reduce((sum, r) => sum + (r.amountRequested || 0), 0)
        };
      }

      setSponsorshipRequests(requestsData);
      setSummary(summaryData);

    } catch (err: any) {
      console.error('Error loading sponsorship requests:', err);
      setError('Failed to load sponsorship requests. Please try again.');
      setSponsorshipRequests([]);
      setSummary({
        totalRequests: 0,
        pendingRequests: 0,
        totalStudents: 0,
        totalAmount: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      const result = await apiClient.updateSponsorshipRequestStatus(requestId, 'approved', 'Approved by sponsor');
      
      if (result.success) {
        loadSponsorshipRequests();
      } else {
        setError('Failed to approve request');
      }
    } catch (err: any) {
      console.error('Error approving request:', err);
      setError('Failed to approve request. Please try again.');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      const result = await apiClient.updateSponsorshipRequestStatus(requestId, 'rejected', 'Rejected by sponsor');
      
      if (result.success) {
        loadSponsorshipRequests();
      } else {
        setError('Failed to reject request');
      }
    } catch (err: any) {
      console.error('Error rejecting request:', err);
      setError('Failed to reject request. Please try again.');
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-mustard/20 text-mustard-500';
      case 'approved':
        return 'bg-forest/15 text-forest-500';
      case 'rejected':
        return 'bg-coral/15 text-coral';
      case 'under_review':
        return 'bg-terracotta/15 text-terracotta-500';
      default:
        return 'bg-cream-100 text-espresso';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'bg-coral/15 text-coral';
      case 'medium':
        return 'bg-mustard/20 text-mustard-500';
      case 'low':
        return 'bg-forest/15 text-forest-500';
      default:
        return 'bg-cream-100 text-espresso';
    }
  };


  if (loading) {
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
            <div className="flex items-center justify-center h-64">
              <div className="clay-card p-8">
                <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-espresso/70">Loading sponsorship requests...</p>
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
      
      <div className="flex pt-16">
        <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
        
        <main className="flex-1 transition-all duration-300 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
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
            <div className="mb-8">
              <PageHeader title="Connect with" accent="teachers" />
              <p className="text-espresso/70">Review and respond to sponsorship requests from educators</p>
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Total Requests</p>
                    <p className="text-2xl font-bold text-espresso mt-1">{summary.totalRequests}</p>
                  </div>
                  <Mail className="h-8 w-8 text-terracotta" />
                </div>
              </div>
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Pending Review</p>
                    <p className="text-2xl font-bold text-mustard-500 mt-1">{summary.pendingRequests}</p>
                  </div>
                  <Clock className="h-8 w-8 text-mustard-500" />
                </div>
              </div>
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Students Impacted</p>
                    <p className="text-2xl font-bold text-forest mt-1">{summary.totalStudents}</p>
                  </div>
                  <Users className="h-8 w-8 text-forest" />
                </div>
              </div>
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Total Amount</p>
                    <p className="text-2xl font-bold text-coral mt-1">
                      {formatCurrency(summary.totalAmount, { locale: language })}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-coral" />
                </div>
              </div>
            </div>

            {}
            <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search requests..."
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
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="all">All Categories</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Technology">Technology</option>
                  <option value="Arts">Arts</option>
                  <option value="Sports">Sports</option>
                </select>
              </div>
            </div>

            {}
            <div className="space-y-6">
              {sponsorshipRequests.map((request) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid border border-espresso/15 p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-espresso">{request.projectTitle}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
                          {request.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getUrgencyColor(request.urgency)}`}>
                          {request.urgency.toUpperCase()} PRIORITY
                        </span>
                      </div>
                      <p className="text-espresso/70 mb-4">{request.projectDescription}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {}
                    <div>
                      <h4 className="font-medium text-espresso mb-3">Teacher Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 text-espresso/45 mr-2" />
                          <span className="font-medium">{request.teacherName}</span>
                          <div className="flex items-center ml-2">
                            <Star className="w-4 h-4 text-yellow-500 fill-current" />
                            <span className="ml-1 text-espresso/70">{request.rating}</span>
                          </div>
                        </div>
                        <div className="flex items-center text-espresso/70">
                          <Mail className="w-4 h-4 text-espresso/45 mr-2" />
                          {request.teacherEmail}
                        </div>
                        <div className="flex items-center text-espresso/70">
                          <Phone className="w-4 h-4 text-espresso/45 mr-2" />
                          {request.teacherPhone}
                        </div>
                        <div className="flex items-center text-espresso/70">
                          <BookOpen className="w-4 h-4 text-espresso/45 mr-2" />
                          {request.school}
                        </div>
                        <div className="flex items-center text-espresso/70">
                          <MapPin className="w-4 h-4 text-espresso/45 mr-2" />
                          {request.location}
                        </div>
                      </div>
                    </div>

                    {}
                    <div>
                      <h4 className="font-medium text-espresso mb-3">Project Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-espresso/70">Amount Requested:</span>
                          <span className="font-medium text-espresso">{formatCurrency(request.amountRequested, { locale: language })}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-espresso/70">Students Impacted:</span>
                          <span className="font-medium text-espresso">{request.studentsImpacted}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-espresso/70">Category:</span>
                          <span className="font-medium text-espresso">{request.category}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-espresso/70">Submitted:</span>
                          <span className="font-medium text-espresso">
                            {new Date(request.submissionDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {}
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-espresso/15">
                    <div className="flex space-x-3">
                      <button className="flex items-center px-3 py-2 text-sm text-terracotta hover:text-terracotta-500 hover:bg-terracotta/10 rounded-lg">
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </button>
                      <button className="flex items-center px-3 py-2 text-sm text-forest hover:text-forest-500 hover:bg-forest/10 rounded-lg">
                        <MessageSquare className="w-4 h-4 mr-1" />
                        Contact Teacher
                      </button>
                    </div>
                    {request.status === 'pending' && (
                      <div className="flex space-x-3">
                        <button 
                          onClick={() => handleRejectRequest(request.id)}
                          className="px-4 py-2 text-sm text-coral border border-red-300 rounded-lg hover:bg-coral/10"
                        >
                          Decline
                        </button>
                        <button 
                          onClick={() => handleApproveRequest(request.id)}
                          className="px-4 py-2 text-sm text-white bg-forest rounded-lg hover:bg-forest-400"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {sponsorshipRequests.length === 0 && !loading && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-espresso mb-2">No sponsorship requests found</h3>
                <p className="text-espresso/55">Check back later for new requests from teachers</p>
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default SponsorConnectTeachersPage; 