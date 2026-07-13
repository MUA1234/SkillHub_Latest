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
  Search, 
  Filter, 
  Download, 
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  FileText,
  CreditCard,
  BookOpen,
  Users,
  Trophy,
  Award,
  Target,
  TrendingUp
} from 'lucide-react';

interface Payment {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  type: 'tuition' | 'extracurricular' | 'materials' | 'subscription' | 'certification';
  description: string;
  teacherName?: string;
  courseName?: string;
  status: 'paid' | 'pending' | 'overdue' | 'refunded';
  paymentMethod: string;
  paymentGateway?: string;
  date: string;
  dueDate?: string;
  receiptUrl?: string;
}

const StudentPaymentHistoryPage = () => {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState({
    totalPaid: 0,
    totalPending: 0,
    totalOverdue: 0,
    totalPayments: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    loadPaymentData();
  }, [router, currentUser?.role]);

  useEffect(() => {
    if (!isLoading) {
      const timeoutId = setTimeout(() => {
        loadPaymentData();
      }, searchQuery ? 300 : 0);

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, statusFilter, typeFilter, dateRange]);

  const loadPaymentData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.getPaymentHistory({
        search: searchQuery,
        status_filter: statusFilter,
        type_filter: typeFilter,
        date_range: dateRange,
        page: 1,
        limit: 50
      });

      if (response.success) {
        const paymentsData = Array.isArray(response.data?.payments) ? response.data.payments : [];
        setPayments(paymentsData);
        setSummary(response.data?.summary || {
          totalPaid: 0,
          totalPending: 0,
          totalOverdue: 0,
          totalPayments: 0
        });
      } else {
        setPayments([]);
        setError('Failed to load payment history');
      }
    } catch (err: any) {
      console.error('Error loading payment data:', err);
      setPayments([]);
      setError(`Failed to load payment history: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getFilterOptions = () => {
    const paymentsArray = Array.isArray(payments) ? payments : [];

    const paymentTypes = [
      { value: 'all', label: 'All Types', count: paymentsArray.length },
      { value: 'tuition', label: 'Tuition Fees', count: paymentsArray.filter(p => p.type === 'tuition').length },
      { value: 'extracurricular', label: 'Extracurricular', count: paymentsArray.filter(p => p.type === 'extracurricular').length },
      { value: 'materials', label: 'Materials', count: paymentsArray.filter(p => p.type === 'materials').length },
      { value: 'subscription', label: 'Subscriptions', count: paymentsArray.filter(p => p.type === 'subscription').length },
      { value: 'certification', label: 'Certifications', count: paymentsArray.filter(p => p.type === 'certification').length }
    ];

    const statusOptions = [
      { value: 'all', label: 'All Status', count: paymentsArray.length },
      { value: 'paid', label: 'Paid', count: paymentsArray.filter(p => p.status === 'paid').length },
      { value: 'pending', label: 'Pending', count: paymentsArray.filter(p => p.status === 'pending').length },
      { value: 'overdue', label: 'Overdue', count: paymentsArray.filter(p => p.status === 'overdue').length },
      { value: 'refunded', label: 'Refunded', count: paymentsArray.filter(p => p.status === 'refunded').length }
    ];

    return { paymentTypes, statusOptions };
  };

  const { paymentTypes, statusOptions } = getFilterOptions();

  const filteredPayments = (Array.isArray(payments) ? payments : []).filter(payment => {
    const matchesSearch = payment.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         payment.transactionId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (payment.teacherName && payment.teacherName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesType = typeFilter === 'all' || payment.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-5 h-5 text-forest" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-mustard-500" />;
      case 'overdue':
        return <AlertCircle className="w-5 h-5 text-coral" />;
      default:
        return <Clock className="w-5 h-5 text-espresso/70" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-forest/15 text-forest-500';
      case 'pending':
        return 'bg-mustard/20 text-mustard-500';
      case 'overdue':
        return 'bg-coral/15 text-coral';
      case 'refunded':
        return 'bg-cream-100 text-espresso';
      default:
        return 'bg-cream-100 text-espresso';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'tuition':
        return <BookOpen className="w-5 h-5 text-terracotta" />;
      case 'extracurricular':
        return <Trophy className="w-5 h-5 text-coral" />;
      case 'materials':
        return <FileText className="w-5 h-5 text-terracotta" />;
      case 'subscription':
        return <Award className="w-5 h-5 text-forest" />;
      case 'certification':
        return <Target className="w-5 h-5 text-coral" />;
      default:
        return <DollarSign className="w-5 h-5 text-espresso/70" />;
    }
  };

  const totalPaid = summary.totalPaid;
  const totalPending = summary.totalPending;
  const totalOverdue = summary.totalOverdue;

  const downloadReceipt = async (payment: Payment) => {
    try {
      setError(null);
      
      console.log('Downloading receipt for:', payment.transactionId);
      
      const blob = await apiClient.downloadPaymentReceipt(payment.id);
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${payment.transactionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (err: any) {
      console.error('Error downloading receipt:', err);
      setError(`Failed to download receipt: ${err?.message || 'Unknown error'}`);
    }
  };

  const viewReceipt = async (payment: Payment) => {
    try {
      setError(null);
      
      console.log('Viewing receipt for:', payment.transactionId);
      
      const blob = await apiClient.downloadPaymentReceipt(payment.id);
      
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, '_blank');
      
      if (!newWindow) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `receipt_${payment.transactionId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      }
      
    } catch (err: any) {
      console.error('Error viewing receipt:', err);
      setError(`Failed to view receipt: ${err?.message || 'Unknown error'}`);
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
            {}
            <div className="mb-8">
              <PageHeader title="Where your" accent="money went" />
              <p className="text-espresso/70">Track all your payment activities and download receipts</p>
            </div>

            {}
            {error && (
              <div className="mb-6 p-4 bg-coral/10 border border-coral/30 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-coral mr-2" />
                  <span className="text-coral">{error}</span>
                </div>
                <button 
                  onClick={loadPaymentData}
                  className="mt-2 text-coral hover:text-coral underline"
                >
                  Try Again
                </button>
              </div>
            )}

            {}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Total Paid</p>
                    {isLoading ? (
                      <div className="h-8 bg-cream-300 rounded mt-1 animate-pulse"></div>
                    ) : (
                      <p className="text-2xl font-bold text-forest mt-1">{formatCurrency(totalPaid, { locale: language })}</p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-forest/10">
                    <CheckCircle className="h-6 w-6 text-forest" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Pending</p>
                    {isLoading ? (
                      <div className="h-8 bg-cream-300 rounded mt-1 animate-pulse"></div>
                    ) : (
                      <p className="text-2xl font-bold text-mustard-500 mt-1">{formatCurrency(totalPending, { locale: language })}</p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-mustard/15">
                    <Clock className="h-6 w-6 text-mustard-500" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Overdue</p>
                    {isLoading ? (
                      <div className="h-8 bg-cream-300 rounded mt-1 animate-pulse"></div>
                    ) : (
                      <p className="text-2xl font-bold text-coral mt-1">{formatCurrency(totalOverdue, { locale: language })}</p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-coral/10">
                    <AlertCircle className="h-6 w-6 text-coral" />
                  </div>
                </div>
              </motion.div>
            </div>

            {}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15 mb-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search payments..."
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
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </option>
                  ))}
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  {paymentTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label} ({type.count})
                    </option>
                  ))}
                </select>

                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                </select>
              </div>
            </motion.div>

            {}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid border border-espresso/15 overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-espresso/15">
                  <thead className="bg-cream-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        Transaction
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-cream-50 divide-y divide-espresso/15">
                    {!isLoading && filteredPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-cream-100">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-espresso">
                              {payment.description}
                            </div>
                            <div className="text-sm text-espresso/55">
                              ID: {payment.transactionId}
                            </div>
                            {payment.teacherName && (
                              <div className="text-sm text-espresso/55">
                                Teacher: {payment.teacherName}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getTypeIcon(payment.type)}
                            <span className="ml-2 text-sm text-espresso capitalize">
                              {payment.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-espresso">
                            {formatCurrency(payment.amount, { currency: payment.currency, locale: language })}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-espresso/55">
                            <span>{payment.paymentMethod}</span>
                            {payment.paymentGateway === 'demo' && (
                              <span className="inline-flex items-center rounded-full bg-mustard/15 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800 uppercase tracking-wide">
                                {t('payment.demo.pill')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getStatusIcon(payment.status)}
                            <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                              {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                            </span>
                          </div>
                          {payment.dueDate && payment.status !== 'paid' && (
                            <div className="text-sm text-espresso/55 mt-1">
                              Due: {new Date(payment.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                          {new Date(payment.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            {payment.status === 'paid' && (
                              <>
                                <button 
                                  onClick={() => viewReceipt(payment)}
                                  className="text-terracotta hover:text-terracotta-700 p-1 rounded hover:bg-terracotta/10"
                                  title="View Receipt"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => downloadReceipt(payment)}
                                  className="text-forest hover:text-forest-500 p-1 rounded hover:bg-forest/10"
                                  title="Download Receipt"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {payment.status !== 'paid' && (
                              <span className="text-espresso/45 text-xs">
                                Receipt not available
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isLoading && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-espresso/55">Loading payment history...</p>
                </div>
              )}

              {!isLoading && filteredPayments.length === 0 && (
                <div className="text-center py-8">
                  <CreditCard className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-espresso mb-2">No payments found</h3>
                  <p className="text-espresso/55">Try adjusting your search criteria</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default StudentPaymentHistoryPage; 