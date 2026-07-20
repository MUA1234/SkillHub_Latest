"use client";
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatPill } from '@/components/ui/stat-pill';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import AuthenticatedNavigation from "@/components/ui/authenticated-navigation";
import DashboardSidebar from "@/components/ui/dashboard-sidebar";
import { apiClient, isAuthenticated, getCurrentUser } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useTranslation } from "@/hooks/use-translation";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  Target,
  Users,
  TrendingUp,
  DollarSign,
  Calendar,
  MapPin,
  Eye,
  Edit,
  Trash2,
  Play,
  Pause,
  BarChart3,
  Award,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
  Download,
  Upload,
} from "lucide-react";

interface SponsorCampaign {
  id: string;
  title: string;
  description: string;
  status: string;
  budget: number | string;
  image?: string;
  completion?: number;
  completionPercentage?: number;
  studentsReached?: number;
  startDate?: string;
  endDate?: string;
  healthStatus?: string;
  costPerStudent?: number;
  budgetUtilized?: number;
  averageImpactPerStudent?: number;
  daysRemaining?: number;
  category?: string;
  targetAudience?: string;
  goals?: string[];
  created_at?: string;
  updated_at?: string;
}

interface CampaignSummary {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalBudget: number;
  totalStudents: number;
  averageCompletion: number;
  costPerStudent: number;
  averageROI: number;
}

const SponsorCampaignsPage = () => {
  const router = useRouter();
  const { language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] =
    useState<SponsorCampaign | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [campaigns, setCampaigns] = useState<SponsorCampaign[]>([]);
  const [summary, setSummary] = useState<
    CampaignSummary & { draftCampaigns: number; totalStudentsReached: number }
  >({
    totalCampaigns: 0,
    activeCampaigns: 0,
    completedCampaigns: 0,
    draftCampaigns: 0,
    totalBudget: 0,
    totalStudents: 0,
    totalStudentsReached: 0,
    averageCompletion: 0,
    costPerStudent: 0,
    averageROI: 0,
  });

  const currentUser = getCurrentUser();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/auth");
      return;
    }

    if (currentUser?.role !== "sponsor") {
      router.push("/auth");
      return;
    }

    loadCampaigns();
  }, [router, currentUser?.role]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!loading) {
        loadCampaigns();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [statusFilter]);

  const loadCampaigns = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiClient.getSponsorCampaigns({
        status_filter: statusFilter,
        page: 1,
        limit: 50,
      });

      let rawCampaigns: any[] = [];

      if (result?.success && result?.data) {
        rawCampaigns = Array.isArray(result.data?.campaigns) ? result.data.campaigns : [];
      } else if (Array.isArray(result?.campaigns)) {
        rawCampaigns = result.campaigns;
      } else if (Array.isArray(result?.data)) {
        rawCampaigns = result.data;
      } else if (Array.isArray(result)) {
        rawCampaigns = result;
      }

      if (rawCampaigns.length > 0 || result?.success !== false) {

        const processedCampaigns = rawCampaigns.map((campaign: any) => {
          const budgetStr = campaign.budget || "LKR 0";
          const budgetNumber =
            parseFloat(budgetStr.replace(/[^\d.]/g, "")) || 0;

          const processedCampaign = {
            ...campaign,
            budget: budgetNumber,
            completionPercentage: campaign.completion || 0,
            studentsReached: campaign.studentsReached || 0,
            healthStatus:
              campaign.completion > 75
                ? "excellent"
                : campaign.completion < 25
                ? "needs_attention"
                : "good",
            costPerStudent:
              campaign.studentsReached > 0
                ? budgetNumber / campaign.studentsReached
                : 0,
            budgetUtilized: budgetNumber * ((campaign.completion || 0) / 100),
            averageImpactPerStudent:
              campaign.studentsReached > 0
                ? budgetNumber / campaign.studentsReached
                : 0,
            daysRemaining: campaign.endDate
              ? Math.max(
                  0,
                  Math.ceil(
                    (new Date(campaign.endDate).getTime() -
                      new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                )
              : 0,
          };

          return processedCampaign;
        });

        setCampaigns(processedCampaigns);

        const totalCampaigns = processedCampaigns.length;
        const activeCampaigns = processedCampaigns.filter(
          (c: any) => c.status === "active"
        ).length;
        const completedCampaigns = processedCampaigns.filter(
          (c: any) => c.status === "completed"
        ).length;
        const draftCampaigns = processedCampaigns.filter(
          (c: any) => c.status === "draft"
        ).length;
        const totalBudget = processedCampaigns.reduce(
          (sum: number, c: any) => sum + (c.budget || 0),
          0
        );
        const totalStudentsReached = processedCampaigns.reduce(
          (sum: number, c: any) => sum + (c.studentsReached || 0),
          0
        );
        const averageCompletion =
          totalCampaigns > 0
            ? processedCampaigns.reduce(
                (sum: number, c: any) => sum + (c.completionPercentage || 0),
                0
              ) / totalCampaigns
            : 0;

        setSummary({
          totalCampaigns,
          activeCampaigns,
          completedCampaigns,
          draftCampaigns,
          totalBudget,
          totalStudents: totalStudentsReached,
          totalStudentsReached,
          averageCompletion,
          costPerStudent:
            totalStudentsReached > 0 ? totalBudget / totalStudentsReached : 0,
          averageROI: 0,
        });
      }
    } catch (err: any) {
      console.error("Error loading campaigns:", err);
      setCampaigns([]);
      setError("Failed to load campaigns. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCampaign = async (campaignId: string, updateData: any) => {
    try {
      const result = await apiClient.updateCampaign(campaignId, updateData);

      if (result.success) {
        loadCampaigns();
      } else {
        setError("Failed to update campaign");
      }
    } catch (err: any) {
      console.error("Error updating campaign:", err);
      setError("Failed to update campaign. Please try again.");
    }
  };

  const handleCreateCampaign = async (formData: FormData) => {
    setIsProcessing(true);
    try {
      const campaignData: any = {};
      formData.forEach((value, key) => {
        campaignData[key] = value;
      });

      if (campaignData.budget) {
        campaignData.budget = Number(campaignData.budget);
      }

      const result = await apiClient.createCampaign(campaignData);

      if (result.success) {
        setShowCreateModal(false);
        loadCampaigns();
        alert("Campaign created successfully!");
      } else {
        setError("Failed to create campaign");
      }
    } catch (error) {
      console.error("Error creating campaign:", error);
      setError("Failed to create campaign. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditCampaign = async (formData: FormData) => {
    if (!selectedCampaign) return;
    setIsProcessing(true);
    try {
      const updateData: any = {};
      formData.forEach((value, key) => {
        updateData[key] = value;
      });

      if (updateData.budget) {
        updateData.budget = Number(updateData.budget);
      }
      if (updateData.completionPercentage) {
        updateData.completion = Number(updateData.completionPercentage);
      }
      if (updateData.studentsReached) {
        updateData.studentsReached = Number(updateData.studentsReached);
      }

      const result = await apiClient.updateCampaign(
        selectedCampaign.id,
        updateData
      );

      if (result.success) {
        setShowEditModal(false);
        setSelectedCampaign(null);
        loadCampaigns();
        alert("Campaign updated successfully!");
      } else {
        setError("Failed to update campaign");
      }
    } catch (error) {
      console.error("Error updating campaign:", error);
      setError("Failed to update campaign. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!selectedCampaign) return;

    setIsProcessing(true);
    try {
      const result = await apiClient.deleteCampaign(selectedCampaign.id);

      if (result.success) {
        setShowDeleteModal(false);
        setSelectedCampaign(null);
        loadCampaigns();
        alert("Campaign deleted successfully!");
      } else {
        setError("Failed to delete campaign");
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      setError("Failed to delete campaign. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (campaign: any) => {
    setSelectedCampaign(campaign);
    setShowEditModal(true);
  };

  const openDeleteModal = (campaign: any) => {
    setSelectedCampaign(campaign);
    setShowDeleteModal(true);
  };

  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);

  const downloadCampaignsCsv = () => {
    const header = ['Title', 'Status', 'Budget', 'Students Reached', 'Completion %', 'Start Date', 'End Date'];
    const rows = campaigns.map((c) => [
      c.title, c.status, String(c.budget), String(c.studentsReached || 0),
      String(c.completionPercentage || 0), c.startDate || '', c.endDate || '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const campaignStats = [
    {
      label: "Total Campaigns",
      value: summary.totalCampaigns.toString(),
      icon: Target,
      change: `${summary.activeCampaigns} active`,
    },
    {
      label: "Students Reached",
      value: formatNumber(summary.totalStudentsReached, { locale: language }),
      icon: Users,
      change: `${summary.completedCampaigns} completed`,
    },
    {
      label: "Total Investment",
      value: formatCurrency(summary.totalBudget, { locale: language, compact: true }),
      icon: DollarSign,
      change: `${summary.draftCampaigns} in draft`,
    },
    {
      label: "Average Completion",
      value: `${summary.averageCompletion.toFixed(1)}%`,
      icon: TrendingUp,
      change: "across all campaigns",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-forest/10 text-forest border-forest/30";
      case "paused":
        return "bg-mustard/15 text-mustard-500 border-mustard/40";
      case "completed":
        return "bg-terracotta/10 text-terracotta border-terracotta/30";
      case "draft":
        return "bg-cream-100 text-espresso/70 border-espresso/15";
      default:
        return "bg-cream-100 text-espresso/70 border-espresso/15";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <Activity className="w-4 h-4" />;
      case "paused":
        return <Pause className="w-4 h-4" />;
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "draft":
        return <Edit className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation
          userRole="sponsor"
          userName={
            currentUser?.profile?.first_name
              ? `${currentUser.profile.first_name} ${currentUser.profile.last_name}`
              : currentUser?.email || "Sponsor"
          }
          userEmail={currentUser?.email || "sponsor@skillhub.com"}
        />
        <DashboardSidebar userRole="sponsor" />

        <div className="pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center h-64">
              <div className="clay-card p-8">
                <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-espresso/70">Loading campaigns...</p>
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
        userName={
          currentUser?.profile?.first_name
            ? `${currentUser.profile.first_name} ${currentUser.profile.last_name}`
            : currentUser?.email || "Sponsor"
        }
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
                <span>{error}</span>
                <button
                  onClick={() => setError("")}
                  className="ml-auto text-red-500 hover:text-coral"
                >
                  ×
                </button>
              </motion.div>
            )}

            {}
            <div className="flex items-center justify-between mb-8">
              <div>
                <PageHeader title="Your" accent="campaigns" />
                <p className="text-espresso/70">
                  Create, manage, and track your educational sponsorship
                  campaigns.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center inline-flex items-center gap-2 px-4 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create Campaign
              </button>
            </div>

            {}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
              {campaignStats.map((stat, index) => {
                const tones: any[] = ['mustard', 'terracotta', 'forest', 'espresso'];
                const badges = ['A', 'B', 'C', 'D'];
                return (
                  <StatPill
                    key={index}
                    onDark={false}
                    tone={tones[index % tones.length] as any}
                    badge={badges[index % badges.length]}
                    value={stat.value}
                    label={stat.label}
                  />
                );
              })}
            </div>

            {}
            <div className="bg-cream-50 p-5 rounded-2xl border-2 border-espresso/10 shadow-kid mb-8">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search campaigns..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-cream-100 border-2 border-espresso/15 rounded-full text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                    />
                  </div>
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2.5 bg-cream-100 border-2 border-espresso/15 rounded-full text-espresso text-sm font-semibold focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="all">All Campaigns</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            {}
            <div className="space-y-6">
              {campaigns.map((campaign, index) => (
                <motion.div
                  key={campaign.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso shadow-sticker-sm hover:shadow-sticker hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center mb-2 flex-wrap gap-2">
                        <h3 className="font-display text-xl font-bold text-espresso mr-2">
                          {campaign.title}
                        </h3>
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getStatusColor(
                            campaign.status
                          )}`}
                        >
                          {getStatusIcon(campaign.status)}
                          <span className="ml-2 capitalize">
                            {campaign.status}
                          </span>
                        </span>
                        {campaign.healthStatus === "excellent" && (
                          <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs bg-forest/15 text-forest-500">
                            <Award className="w-3 h-3 mr-1" />
                            Excellent
                          </span>
                        )}
                        {campaign.healthStatus === "needs_attention" && (
                          <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs bg-mustard/20 text-mustard-500">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Needs Attention
                          </span>
                        )}
                      </div>

                      <div className="flex items-center text-sm text-espresso/70 mb-3">
                        <span className="mr-6">Education Campaign</span>
                        <Calendar className="w-4 h-4 mr-1" />
                        <span className="mr-6">
                          {campaign.startDate
                            ? new Date(campaign.startDate).toLocaleDateString()
                            : "TBD"}{" "}
                          -
                          {campaign.endDate
                            ? new Date(campaign.endDate).toLocaleDateString()
                            : "TBD"}
                        </span>
                        {(campaign.daysRemaining || 0) > 0 && (
                          <>
                            <Clock className="w-4 h-4 mr-1" />
                            <span>{campaign.daysRemaining} days remaining</span>
                          </>
                        )}
                      </div>

                      <p className="text-espresso/70 mb-4">
                        {campaign.description}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {formatCurrency(campaign.budget, { locale: language })}
                          </div>
                          <div className="text-sm text-espresso/55">Budget</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {formatCurrency(campaign.budgetUtilized || 0, { locale: language })}
                          </div>
                          <div className="text-sm text-espresso/55">Utilized</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {formatNumber(campaign.studentsReached || 0, { locale: language })}
                          </div>
                          <div className="text-sm text-espresso/55">Students</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {campaign.completionPercentage}%
                          </div>
                          <div className="text-sm text-espresso/55">Progress</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {(campaign.costPerStudent || 0) > 0
                              ? formatCurrency(campaign.costPerStudent || 0, { locale: language })
                              : "TBD"}
                          </div>
                          <div className="text-sm text-espresso/55">
                            Cost/Student
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-espresso">
                            {(campaign.averageImpactPerStudent || 0) > 0
                              ? formatCurrency(campaign.averageImpactPerStudent || 0, { locale: language })
                              : "TBD"}
                          </div>
                          <div className="text-sm text-espresso/55">
                            Impact/Student
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setExpandedCampaignId(expandedCampaignId === campaign.id ? null : campaign.id)}
                        className="p-2 text-espresso/45 hover:text-espresso/70 transition-colors"
                        title="View Campaign"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => openEditModal(campaign)}
                        className="p-2 text-espresso/45 hover:text-espresso/70 transition-colors"
                        title="Edit Campaign"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(campaign)}
                        className="p-2 text-espresso/45 hover:text-coral transition-colors"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {expandedCampaignId === campaign.id && (
                    <div className="border-t pt-4 mb-4 text-sm space-y-2">
                      {campaign.image && (
                        <img src={campaign.image} alt={campaign.title} className="w-full max-w-xs rounded-lg border border-espresso/15 mb-2" />
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-espresso/55">Created:</span>
                        <span className="font-medium text-espresso">{campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-espresso/55">Campaign ID:</span>
                        <span className="font-mono text-xs text-espresso">{campaign.id}</span>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {campaign.status === "active" && (
                          <button
                            onClick={() =>
                              handleUpdateCampaign(campaign.id, {
                                status: "paused",
                              })
                            }
                            className="flex items-center px-3 py-2 bg-mustard-400 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                          >
                            <Pause className="w-4 h-4 mr-2" />
                            Pause Campaign
                          </button>
                        )}
                        {campaign.status === "paused" && (
                          <button
                            onClick={() =>
                              handleUpdateCampaign(campaign.id, {
                                status: "active",
                              })
                            }
                            className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-forest text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Resume Campaign
                          </button>
                        )}
                        {campaign.status === "draft" && (
                          <button
                            onClick={() =>
                              handleUpdateCampaign(campaign.id, {
                                status: "active",
                              })
                            }
                            className="flex items-center inline-flex items-center gap-2 px-3 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Launch Campaign
                          </button>
                        )}
                        <button
                          onClick={() => router.push('/sponsors/analytics')}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <BarChart3 className="w-4 h-4 mr-2" />
                          View Analytics
                        </button>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => openEditModal(campaign)}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </button>
                        <button
                          onClick={downloadCampaignsCsv}
                          className="flex items-center px-3 py-2 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Report
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {}
            {campaigns.length === 0 && !loading && (
              <div className="text-center py-12">
                <Target className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-espresso mb-2">
                  No campaigns found
                </h3>
                <p className="text-espresso/55 mb-6">
                  Get started by creating your first educational sponsorship
                  campaign
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center inline-flex items-center gap-2 px-4 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Your First Campaign
                </button>
              </div>
            )}

            {}
            {campaigns.length > 0 && (
              <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-8 mt-8 text-center">
                <h2 className="text-2xl font-bold text-espresso mb-4">
                  Ready to Launch Your Next Campaign?
                </h2>
                <p className="text-espresso/70 mb-6 max-w-2xl mx-auto">
                  Create targeted educational campaigns that make real impact.
                  Our platform provides all the tools you need to plan, execute,
                  and measure successful sponsorship campaigns.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center inline-flex items-center gap-2 px-8 py-3 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold font-semibold"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Create New Campaign
                  </button>
                  <button
                    onClick={() => router.push('/sponsors/analytics')}
                    className="inline-flex items-center px-8 py-3 border border-red-600 text-coral rounded-lg hover:bg-coral/10 transition-colors font-semibold"
                  >
                    <BarChart3 className="w-5 h-5 mr-2" />
                    View Analytics
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-espresso">
                  Create New Campaign
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  handleCreateCampaign(formData);
                }}
              >
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="title"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Campaign Title *
                    </label>
                    <input
                      type="text"
                      id="title"
                      name="title"
                      required
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Enter campaign title"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="description"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Description
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Brief campaign description"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="image"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Campaign Image
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        id="image"
                        name="image"
                        accept="image/*"
                        className="hidden"
                      />
                      <label
                        htmlFor="image"
                        className="cursor-pointer flex items-center justify-center px-4 py-6 border-2 border-dashed border-espresso/20 rounded-lg hover:border-red-500 focus-within:border-red-500 transition-colors bg-cream-100"
                      >
                        <Upload className="w-6 h-6 text-espresso/45 mr-2" />
                        <span className="text-espresso font-medium">
                          Choose Image (Optional)
                        </span>
                        <p className="text-xs text-espresso/55 mt-1">
                          Upload a representative image for your campaign.
                          Supported formats: JPG, PNG, GIF.
                        </p>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="budget"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Budget (LKR) *
                    </label>
                    <input
                      type="number"
                      id="budget"
                      name="budget"
                      required
                      min="1"
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Campaign budget"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="startDate"
                        className="block text-sm font-medium text-espresso mb-1"
                      >
                        Start Date
                      </label>
                      <input
                        type="date"
                        id="startDate"
                        name="startDate"
                        className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="endDate"
                        className="block text-sm font-medium text-espresso mb-1"
                      >
                        End Date
                      </label>
                      <input
                        type="date"
                        id="endDate"
                        name="endDate"
                        className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 mt-6">
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
                    {isProcessing && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>
                      {isProcessing ? "Creating..." : "Create Campaign"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {}
      {showEditModal && selectedCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-espresso">
                  Edit Campaign
                </h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  handleEditCampaign(formData);
                }}
              >
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="editTitle"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Campaign Title *
                    </label>
                    <input
                      type="text"
                      id="editTitle"
                      name="title"
                      required
                      defaultValue={selectedCampaign.title}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Enter campaign title"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="editDescription"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Description
                    </label>
                    <textarea
                      id="editDescription"
                      name="description"
                      rows={3}
                      defaultValue={selectedCampaign.description}
                      className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Brief campaign description"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="editImage"
                      className="block text-sm font-medium text-espresso mb-1"
                    >
                      Campaign Image
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        id="editImage"
                        name="image"
                        accept="image/*"
                        className="hidden"
                      />
                      <label
                        htmlFor="editImage"
                        className="cursor-pointer flex items-center justify-center px-4 py-6 border-2 border-dashed border-espresso/20 rounded-lg hover:border-red-500 focus-within:border-red-500 transition-colors bg-cream-100"
                      >
                        <Upload className="w-6 h-6 text-espresso/45 mr-2" />
                        <span className="text-espresso font-medium">
                          Change Image (Optional)
                        </span>
                        <p className="text-xs text-espresso/55 mt-1">
                          Upload a new image if desired. Supported formats: JPG,
                          PNG, GIF.
                        </p>
                      </label>
                      {selectedCampaign.image && (
                        <div className="mt-2">
                          <p className="text-sm text-espresso/70 mb-1">
                            Current Image:
                          </p>
                          <img
                            src={selectedCampaign.image}
                            alt="Current campaign image"
                            className="w-32 h-32 object-cover rounded-lg border"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="editBudget"
                        className="block text-sm font-medium text-espresso mb-1"
                      >
                        Budget (LKR) *
                      </label>
                      <input
                        type="number"
                        id="editBudget"
                        name="budget"
                        required
                        min="1"
                        defaultValue={selectedCampaign.budget}
                        className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Campaign budget"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="editStudentsReached"
                        className="block text-sm font-medium text-espresso mb-1"
                      >
                        Students Reached
                      </label>
                      <input
                        type="number"
                        id="editStudentsReached"
                        name="studentsReached"
                        min="0"
                        defaultValue={selectedCampaign.studentsReached || 0}
                        className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Number of students"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="editCompletion"
                        className="block text-sm font-medium text-espresso mb-1"
                      >
                        Completion %
                      </label>
                      <input
                        type="number"
                        id="editCompletion"
                        name="completionPercentage"
                        min="0"
                        max="100"
                        defaultValue={
                          selectedCampaign.completionPercentage || 0
                        }
                        className="w-full px-3 py-2 border border-espresso/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Completion percentage"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 mt-6">
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
                    {isProcessing && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>
                      {isProcessing ? "Updating..." : "Update Campaign"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {}
      {showDeleteModal && selectedCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-cream-50 rounded-xl max-w-md w-full"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-espresso">
                  Delete Campaign
                </h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="text-espresso/45 hover:text-espresso/70"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                <p className="text-espresso/70 mb-2">
                  Are you sure you want to delete this campaign?
                </p>
                <div className="bg-cream-100 p-3 rounded-lg">
                  <p className="font-semibold text-espresso">
                    {selectedCampaign.title}
                  </p>
                  <p className="text-sm text-espresso/55">
                    Budget: {formatCurrency(selectedCampaign.budget || 0, { locale: language })}
                  </p>
                </div>
                <p className="text-coral text-sm mt-2">
                  This action cannot be undone.
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
                  onClick={handleDeleteCampaign}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-coral text-cream rounded-full border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isProcessing && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>
                    {isProcessing ? "Deleting..." : "Delete Campaign"}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SponsorCampaignsPage;
