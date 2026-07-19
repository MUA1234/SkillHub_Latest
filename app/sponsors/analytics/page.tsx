'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, isAuthenticated, getCurrentUser } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  Award,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Eye,
  PieChart,
  LineChart,
  Activity,
  Zap,
  ArrowUp,
  ArrowDown,
  Clock,
  Globe,
  Loader,
  AlertCircle
} from 'lucide-react';

interface OverviewMetric {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: any;
  color: string;
  bgColor: string;
}

interface CampaignMetric {
  name: string;
  investment: string;
  roi: string;
  studentsReached: number;
  engagementRate: string;
  status: string;
  progress: number;
}

interface MonthlyData {
  month: string;
  investment: number;
  returns: number;
  students: number;
}

interface ImpactMetric {
  category: string;
  metrics: {
    label: string;
    value: string;
    change: string;
  }[];
}

interface AnalyticsData {
  overviewMetrics: OverviewMetric[];
  campaignMetrics: CampaignMetric[];
  monthlyData: MonthlyData[];
  impactMetrics: ImpactMetric[];
}

// The backend sends icon names as strings (JSON can't carry a component
// reference) — map them to the actual imported lucide icons here.
const ICON_MAP: Record<string, any> = { TrendingUp, Users, Target, Activity };

const SponsorAnalyticsPage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [timeRange, setTimeRange] = useState('last-30-days');
  const [metricType, setMetricType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    overviewMetrics: [],
    campaignMetrics: [],
    monthlyData: [],
    impactMetrics: []
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
    
    loadAnalytics();
  }, [router, currentUser?.role]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!loading) {
        loadAnalytics();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiClient.getSponsorAnalytics(timeRange);

      let analyticsResult: AnalyticsData = {
        overviewMetrics: [],
        campaignMetrics: [],
        monthlyData: [],
        impactMetrics: []
      };

      if (result?.success && result?.data) {
        analyticsResult = {
          overviewMetrics: Array.isArray(result.data?.overviewMetrics) ? result.data.overviewMetrics : [],
          campaignMetrics: Array.isArray(result.data?.campaignMetrics) ? result.data.campaignMetrics : [],
          monthlyData: Array.isArray(result.data?.monthlyData) ? result.data.monthlyData : [],
          impactMetrics: Array.isArray(result.data?.impactMetrics) ? result.data.impactMetrics : []
        };
      } else if (result && !result.success) {
        analyticsResult = {
          overviewMetrics: Array.isArray(result?.overviewMetrics) ? result.overviewMetrics : [],
          campaignMetrics: Array.isArray(result?.campaignMetrics) ? result.campaignMetrics : [],
          monthlyData: Array.isArray(result?.monthlyData) ? result.monthlyData : [],
          impactMetrics: Array.isArray(result?.impactMetrics) ? result.impactMetrics : []
        };
      }

      setAnalyticsData(analyticsResult);

    } catch (err: any) {
      console.error('Error loading analytics:', err);
      setAnalyticsData({
        overviewMetrics: [],
        campaignMetrics: [],
        monthlyData: [],
        impactMetrics: []
      });
      setError('Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'up' ? (
      <ArrowUp className="w-4 h-4 text-green-500" />
    ) : (
      <ArrowDown className="w-4 h-4 text-red-500" />
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-forest/15 text-forest-500';
      case 'completed':
        return 'bg-terracotta/15 text-terracotta-500';
      case 'ongoing':
        return 'bg-mustard/20 text-mustard-500';
      default:
        return 'bg-cream-100 text-espresso';
    }
  };

  const overviewMetrics = analyticsData.overviewMetrics;
  const campaignMetrics = analyticsData.campaignMetrics;
  const impactMetrics = analyticsData.impactMetrics;

  // Real, data-derived insights — only shown when there's real data to derive
  // them from. No fabricated "recommendation" copy: unlike a top performer or
  // a real trend figure, a genuine recommendation would need a model this
  // platform doesn't have, so that card is omitted rather than faked.
  const topPerformer = campaignMetrics.length > 0
    ? [...campaignMetrics].sort((a, b) => (parseFloat(b.roi) || 0) - (parseFloat(a.roi) || 0))[0]
    : null;
  const growthMetric = overviewMetrics.find((m) => m.label === 'Students Reached') || overviewMetrics[0] || null;

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
                <p className="text-espresso/70">Loading analytics...</p>
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
                <PageHeader title="Your impact, in" accent="numbers" />
                <p className="text-espresso/70">
                  Track your sponsorship performance, ROI, and educational impact.
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="px-4 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="last-7-days">Last 7 Days</option>
                  <option value="last-30-days">Last 30 Days</option>
                  <option value="last-90-days">Last 90 Days</option>
                  <option value="last-year">Last Year</option>
                </select>
               
                <button className="flex items-center inline-flex items-center gap-2 px-4 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold">
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </button>
              </div>
            </div>

            {}
            {overviewMetrics.length === 0 ? (
              <EmptyState
                size="sm"
                title="No analytics yet"
                body="Once you launch a campaign or event, your ROI and reach numbers will show up here."
                className="mb-8 flex flex-col items-center text-center py-8"
              />
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {overviewMetrics.map((metric, index) => {
                const Icon = ICON_MAP[metric.icon] || BarChart3;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid hover:shadow-kid-lg hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                        <Icon className={`w-6 h-6 ${metric.color}`} />
                      </div>
                      <div className="flex items-center space-x-1">
                        {getTrendIcon(metric.trend)}
                        <span className={`text-sm font-medium ${
                          metric.trend === 'up' ? 'text-forest' : 'text-coral'
                        }`}>
                          {metric.change}
                        </span>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-espresso mb-1">{metric.value}</div>
                    <div className="text-sm text-espresso/70">{metric.label}</div>
                  </motion.div>
                );
              })}
            </div>
            )}

            {}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-espresso">ROI Trend</h3>
                  <LineChart className="w-5 h-5 text-espresso/45" />
                </div>
                <div className="h-64 flex items-center justify-center bg-cream-100 rounded-lg">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-espresso/45 mx-auto mb-2" />
                    <p className="text-espresso/55">Chart visualization would go here</p>
                    <p className="text-sm text-espresso/45">Monthly ROI performance tracking</p>
                  </div>
                </div>
              </motion.div>

              {}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-espresso">Student Reach</h3>
                  <PieChart className="w-5 h-5 text-espresso/45" />
                </div>
                <div className="h-64 flex items-center justify-center bg-cream-100 rounded-lg">
                  <div className="text-center">
                    <Users className="w-12 h-12 text-espresso/45 mx-auto mb-2" />
                    <p className="text-espresso/55">Chart visualization would go here</p>
                    <p className="text-sm text-espresso/45">Student demographics and reach</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-espresso">Campaign Performance</h3>
                <button className="flex items-center px-3 py-2 text-sm bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors">
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </button>
              </div>
              {campaignMetrics.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No campaigns yet"
                  body="Launch a campaign to see its investment, ROI, and reach here."
                  className="flex flex-col items-center text-center py-6"
                />
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-espresso/15">
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">Campaign</th>
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">Investment</th>
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">ROI</th>
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">Students</th>
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">Engagement</th>
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-espresso/70">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignMetrics.map((campaign, index) => (
                      <tr key={index} className="border-b border-espresso/10 hover:bg-cream-100">
                        <td className="py-3 px-4">
                          <div className="font-medium text-espresso">{campaign.name}</div>
                        </td>
                        <td className="py-3 px-4 text-espresso/70">{campaign.investment}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-forest">{campaign.roi}</span>
                        </td>
                        <td className="py-3 px-4 text-espresso/70">{formatNumber(campaign.studentsReached, { locale: language })}</td>
                        <td className="py-3 px-4 text-espresso/70">{campaign.engagementRate}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div className="w-full bg-cream-300 rounded-full h-2 mr-2">
                              <div 
                                className="bg-coral h-2 rounded-full" 
                                style={{ width: `${campaign.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-espresso/70">{campaign.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </motion.div>

            {}
            {impactMetrics.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {impactMetrics.map((category, categoryIndex) => (
                <motion.div
                  key={categoryIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + categoryIndex * 0.1 }}
                  className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid"
                >
                  <h3 className="text-lg font-semibold text-espresso mb-6">{category.category}</h3>
                  <div className="space-y-4">
                    {category.metrics.map((metric, metricIndex) => (
                      <div key={metricIndex} className="flex items-center justify-between">
                        <span className="text-espresso/70">{metric.label}</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-espresso">{metric.value}</span>
                          <span className="text-sm text-forest bg-forest/10 px-2 py-1 rounded-full">
                            {metric.change}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
            )}

            {}
            {(topPerformer || growthMetric) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mb-8"
            >
              <h3 className="text-lg font-semibold text-espresso mb-6">Performance Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {topPerformer && (
                <div className="p-4 bg-forest/10 rounded-lg">
                  <div className="flex items-center mb-3">
                    <Zap className="w-5 h-5 text-forest mr-2" />
                    <h4 className="font-medium text-forest-500">Top Performer</h4>
                  </div>
                  <p className="text-sm text-forest-500">
                    {topPerformer!.name} leads with {topPerformer!.roi} ROI, reaching {formatNumber(topPerformer!.studentsReached, { locale: language })} students
                  </p>
                </div>
                )}
                {growthMetric && (
                <div className="p-4 bg-terracotta/10 rounded-lg">
                  <div className="flex items-center mb-3">
                    <TrendingUp className="w-5 h-5 text-terracotta mr-2" />
                    <h4 className="font-medium text-terracotta-500">{growthMetric.label} Trend</h4>
                  </div>
                  <p className="text-sm text-terracotta-500">
                    {growthMetric.label} is {growthMetric.value}, {growthMetric.change} versus the previous period
                  </p>
                </div>
                )}
              </div>
            </motion.div>
            )}

            {}
            <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-espresso mb-4">Advanced Analytics</h2>
              <p className="text-espresso/70 mb-6 max-w-2xl mx-auto">
                Get deeper insights into your sponsorship performance with custom reports, 
                predictive analytics, and detailed ROI breakdowns.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button className="inline-flex items-center inline-flex items-center gap-2 px-8 py-3 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold font-semibold">
                  <Download className="w-5 h-5 mr-2" />
                  Generate Full Report
                </button>
                <button className="inline-flex items-center px-8 py-3 border border-red-600 text-coral rounded-lg hover:bg-coral/10 transition-colors font-semibold">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Custom Analytics
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default SponsorAnalyticsPage; 