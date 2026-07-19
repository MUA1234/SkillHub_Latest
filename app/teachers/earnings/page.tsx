'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { DollarSign, CreditCard, TrendingUp, ArrowLeft, Download, BarChart2, Users, Loader, AlertCircle, Wallet, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface EarningsData {
  totalEarnings: number;
  pendingBalance: number;
  avgPerStudent: number;
  monthlyData: Array<{
    month: string;
    earnings: number;
    students: number;
    courses: number;
  }>;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    status: string;
  }>;
}

interface PayoutRow {
  id: string;
  amount_lkr: number | string;
  status: 'pending' | 'approved' | 'paid' | 'cancelled' | string;
  period_start?: string | null;
  period_end?: string | null;
  bank_name?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  bank_reference?: string | null;
  admin_notes?: string | null;
  requested_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
}

interface PayoutSummary {
  currency: string;
  gross_earned: number;
  paid_out: number;
  outstanding: number;
  payouts: PayoutRow[];
}

const EarningsPage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [timeRange, setTimeRange] = useState('month');
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [earningsData, setEarningsData] = useState<EarningsData | null>(null);
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);

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

    fetchEarningsData();
  }, [router, currentUser?.role, timeRange]);

  const fetchEarningsData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const [earningsResponse, paymentHistoryResponse, summaryResponse] = await Promise.all([
        apiClient.getTeacherEarnings().catch(() => null),
        apiClient.getTeacherPaymentHistory({ date_range: timeRange }).catch(() => ({ transactions: [] })),
        apiClient.getMyEarningsSummary().catch(() => null),
      ]);

      const earnings = earningsResponse || {};
      const transactions = paymentHistoryResponse?.transactions || [];

      if (summaryResponse && summaryResponse.success) {
        setPayoutSummary({
          currency: summaryResponse.currency || 'LKR',
          gross_earned: Number(summaryResponse.gross_earned) || 0,
          paid_out: Number(summaryResponse.paid_out) || 0,
          outstanding: Number(summaryResponse.outstanding) || 0,
          payouts: (summaryResponse.payouts || []) as PayoutRow[],
        });
      } else {
        setPayoutSummary(null);
      }

      setEarningsData({
        // Real field names from GET /teachers/earnings (teacher_controller.ex
        // earnings/2) — this page previously read total_earnings correctly
        // but pending_balance/avg_per_student/monthly_data/revenue_sources
        // don't exist in that response at all, so those were always the
        // hardcoded fallback, never real data.
        totalEarnings: earnings.total_earnings || 0,
        pendingBalance: earnings.pending_payments || 0,
        avgPerStudent: 0,
        monthlyData: (earnings.monthly_earnings || []).map((m: any) => ({
          month: m.month,
          earnings: m.total || 0,
          students: 0,
          courses: 0,
        })),
        transactions: transactions.map((t: any) => ({
          id: t.id || `TX-${Math.random().toString(36).substr(2, 9)}`,
          date: t.created_at ? new Date(t.created_at).toLocaleDateString() : 'N/A',
          description: t.description || t.course_title || 'Payment',
          amount: t.amount || 0,
          status: t.status || 'Completed'
        })),
      });
    } catch (err: any) {
      console.error('Earnings error:', err);
      setError(err.message || 'Failed to load earnings data');
    } finally {
      setIsLoading(false);
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
        <DashboardSidebar userRole="teacher" />
        <div className="pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <Loader className="w-8 h-8 animate-spin text-terracotta mx-auto mb-4" />
                <p className="text-espresso/70">Loading earnings data...</p>
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
            <div className="bg-coral/15 border border-coral text-coral px-4 py-3 rounded flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
              <button
                onClick={fetchEarningsData}
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

  const monthlyData = earningsData?.monthlyData || [];
  const transactions = earningsData?.transactions || [];
  const maxEarning = Math.max(...monthlyData.map(m => m.earnings), 1);

  const totalEarningsValue =
    payoutSummary?.gross_earned ?? earningsData?.totalEarnings ?? 0;
  const outstandingValue =
    payoutSummary?.outstanding ?? earningsData?.pendingBalance ?? 0;
  const paidOutValue = payoutSummary?.paid_out ?? 0;
  const payouts = payoutSummary?.payouts || [];

  const formatDate = (iso?: string | null): string => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(
        language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK',
        { year: 'numeric', month: 'short', day: 'numeric' },
      ).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const payoutStatusPill = (status: string) => {
    const s = (status || '').toLowerCase();
    const cfg: Record<string, { bg: string; text: string; Icon: typeof Clock }> = {
      pending: { bg: 'bg-mustard/20', text: 'text-mustard-500', Icon: Clock },
      approved: { bg: 'bg-terracotta/15', text: 'text-terracotta', Icon: CheckCircle2 },
      paid: { bg: 'bg-forest/15', text: 'text-forest-500', Icon: CheckCircle2 },
      cancelled: { bg: 'bg-coral/15', text: 'text-coral', Icon: XCircle },
    };
    const { bg, text, Icon } = cfg[s] || cfg.pending;
    return (
      <span className={`px-2 py-1 inline-flex items-center text-xs font-semibold rounded-full ${bg} ${text}`}>
        <Icon className="w-3 h-3 mr-1" />
        {s.charAt(0).toUpperCase() + s.slice(1) || 'Pending'}
      </span>
    );
  };

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
          <div className="flex items-center justify-between mb-8">
            <div>
              <PageHeader title="Your" accent="earnings" />
              <p className="text-espresso/70 mt-2">Track your earnings and financial performance</p>
            </div>
            <button
              onClick={() => router.back()}
              className="clay-card px-4 py-2 text-espresso hover:bg-cream-100 flex items-center"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="clay-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-espresso">Total Earnings</h2>
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-espresso mb-2">
                {formatCurrency(totalEarningsValue, { locale: language })}
              </div>
              <p className="text-espresso/70 text-sm">Gross from all completed session payments</p>
            </div>

            <div className="clay-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-espresso">Outstanding</h2>
                <CreditCard className="w-6 h-6 text-terracotta" />
              </div>
              <div className="text-3xl font-bold text-espresso mb-2">
                {formatCurrency(outstandingValue, { locale: language })}
              </div>
              <p className="text-espresso/70 text-sm">
                {payoutSummary
                  ? 'Earned but not yet covered by a payout'
                  : 'Available for withdrawal soon'}
              </p>
            </div>

            <div className="clay-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-espresso">
                  {payoutSummary ? 'Paid Out' : 'Avg. per Student'}
                </h2>
                {payoutSummary
                  ? <Wallet className="w-6 h-6 text-forest-300" />
                  : <Users className="w-6 h-6 text-forest-300" />}
              </div>
              <div className="text-3xl font-bold text-espresso mb-2">
                {formatCurrency(
                  payoutSummary ? paidOutValue : (earningsData?.avgPerStudent || 0),
                  { locale: language },
                )}
              </div>
              <p className="text-espresso/70 text-sm">
                {payoutSummary
                  ? 'Total marked-paid by admin'
                  : 'Average revenue per enrolled student'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex space-x-1">
              {['overview', 'transactions', 'withdrawals'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg ${
                    activeTab === tab
                      ? 'bg-terracotta text-white'
                      : 'clay-card text-espresso hover:bg-cream-100'
                  } transition-colors capitalize`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex space-x-2">
              {['week', 'month', 'quarter', 'year'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded-lg ${
                    timeRange === range
                      ? 'bg-terracotta/15 text-terracotta'
                      : 'clay-card text-espresso hover:bg-cream-100'
                  } transition-colors capitalize`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="clay-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-espresso">Earnings Overview</h2>
                <BarChart2 className="w-6 h-6 text-espresso/55" />
              </div>
              <div className="h-72">
                {monthlyData.length > 0 ? (
                  <div className="flex items-end h-5/6 space-x-3">
                    {monthlyData.map((month, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-gradient-to-t from-terracotta-500 to-terracotta-300 border-2 border-espresso border-b-0 rounded-t-lg"
                          style={{ height: `${(month.earnings / maxEarning) * 100}%` }}
                        ></div>
                        <span className="text-sm text-espresso/70 mt-2">{month.month}</span>
                        <span className="text-xs text-espresso/55 mt-1">{formatCurrency(month.earnings, { locale: language, compact: true })}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <BarChart2 className="w-12 h-12 text-espresso/30 mx-auto mb-3" />
                      <p className="text-espresso/55">No earnings data available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="clay-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-espresso">Total Revenue</h2>
                <DollarSign className="w-6 h-6 text-espresso/55" />
              </div>
              <div className="flex flex-col items-center justify-center h-56 text-center">
                <div className="text-3xl font-bold text-espresso mb-2">
                  {formatCurrency(earningsData?.totalEarnings || 0, { locale: language, compact: true })}
                </div>
                <p className="text-sm text-espresso/55">
                  All-time earnings from live session payments.
                </p>
              </div>
            </div>
          </div>
          )}

          {activeTab === 'transactions' && (
          <div className="clay-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-espresso">Recent Transactions</h2>
              <button className="clay-card px-4 py-2 text-terracotta hover:bg-terracotta/10 flex items-center">
                <Download className="w-4 h-4 mr-2" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              {transactions.length > 0 ? (
                <table className="min-w-full divide-y divide-espresso/15">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Transaction ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Amount (LKR)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-espresso/15">
                    {transactions.map(transaction => (
                      <tr key={transaction.id} className="hover:bg-cream-100">
                        <td className="px-4 py-3 text-sm text-espresso">{transaction.id}</td>
                        <td className="px-4 py-3 text-sm text-espresso/70">{transaction.date}</td>
                        <td className="px-4 py-3 text-sm text-espresso">{transaction.description}</td>
                        <td className="px-4 py-3 text-sm text-espresso">{formatNumber(transaction.amount, { locale: language, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            transaction.status === 'Completed' || transaction.status === 'completed'
                              ? 'bg-forest/15 text-forest-500'
                              : 'bg-mustard/20 text-mustard-500'
                          }`}>
                            {transaction.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-espresso/30 mx-auto mb-3" />
                  <p className="text-espresso/55">No transactions yet</p>
                  <p className="text-sm text-espresso/45">Transactions will appear here once students enroll</p>
                </div>
              )}
            </div>

            {transactions.length > 0 && (
              <div className="mt-6 flex justify-between items-center">
                <span className="text-sm text-espresso/70">Showing {transactions.length} transactions</span>
                <div className="flex space-x-2">
                  <button className="clay-card px-4 py-2 text-espresso hover:bg-cream-100">
                    Previous
                  </button>
                  <button className="clay-card bg-terracotta text-white px-4 py-2 hover:bg-terracotta-500">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {activeTab === 'withdrawals' && (
          <div className="clay-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-espresso flex items-center">
                  <Wallet className="w-5 h-5 mr-2 text-forest-500" />
                  Payout History
                </h2>
                <p className="text-sm text-espresso/70 mt-1">
                  Bank transfers initiated by admin against your outstanding balance.
                </p>
              </div>
              {payoutSummary && (
                <div className="text-right">
                  <div className="text-sm text-espresso/70">Outstanding</div>
                  <div className="text-lg font-semibold text-terracotta">
                    {formatCurrency(outstandingValue, { locale: language })}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              {payouts.length > 0 ? (
                <table className="min-w-full divide-y divide-espresso/15">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Bank</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">Last update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-espresso/15">
                    {payouts.map((p) => {
                      const lastUpdate =
                        p.paid_at || p.cancelled_at || p.approved_at || p.requested_at || null;
                      const period =
                        p.period_start && p.period_end
                          ? `${formatDate(p.period_start)} → ${formatDate(p.period_end)}`
                          : '—';
                      return (
                        <tr key={p.id} className="hover:bg-cream-100">
                          <td className="px-4 py-3 text-sm text-espresso">{period}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-espresso">
                            {formatCurrency(Number(p.amount_lkr) || 0, { locale: language })}
                          </td>
                          <td className="px-4 py-3">{payoutStatusPill(p.status)}</td>
                          <td className="px-4 py-3 text-sm text-espresso/80">
                            {p.bank_name ? (
                              <>
                                <div>{p.bank_name}</div>
                                {p.account_number && (
                                  <div className="text-xs text-espresso/55">****{String(p.account_number).slice(-4)}</div>
                                )}
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-espresso/80 font-mono">
                            {p.bank_reference || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-espresso/70">{formatDate(lastUpdate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <Wallet className="w-12 h-12 text-espresso/30 mx-auto mb-3" />
                  <p className="text-espresso/55 font-medium">No payouts yet</p>
                  <p className="text-sm text-espresso/45 mt-1">
                    Once admin approves a payout from your outstanding balance it will appear here with the bank reference.
                  </p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EarningsPage;
