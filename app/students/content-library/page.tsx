'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient } from '@/lib/api';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import { ReadAloudButton } from '@/components/accessibility/ReadAloudButton';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { 
  BookOpen, 
  Search, 
  Filter, 
  Download, 
  Play, 
  FileText, 
  Video, 
  Headphones,
  Image,
  Archive,
  Star,
  Clock,
  Eye,
  Heart,
  Share,
  Loader2,
  CheckCircle,
  Lock,
  Unlock
} from 'lucide-react';

interface ContentItem {
  id: string;
  course_id: string;
  title: string;
  description: string;
  content_type: string;
  access_level: string;
  duration: string;
  file_size: string;
  content_url: string;
  is_downloadable: boolean;
  created_at: string;
  course_title: string;
  teacher_name: string;
  teacher_avatar?: string;
  teacher_rating: number;
  subject_name: string;
  subject_category: string;
  has_access: boolean;
  progress_percentage: number;
  time_spent_minutes: number;
  is_completed: boolean;
  total_enrollments: number;
  thumbnail_url: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
}

interface ContentType {
  id: string;
  name: string;
  count: number;
}

interface UserData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

const StudentContentLibraryPage = () => {
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAccessLevel, setSelectedAccessLevel] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [wishlistedCourseIds, setWishlistedCourseIds] = useState<Set<string>>(new Set());
  const [wishlistBusyId, setWishlistBusyId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [accessLevels, setAccessLevels] = useState<Category[]>([]);
  const [activeMedia, setActiveMedia] = useState<ContentItem | null>(null);
  // Resolve r2:// content_urls to a short-lived presigned URL for playback.
  const [playbackSrc, setPlaybackSrc] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    if (!activeMedia?.content_url) { setPlaybackSrc(''); return; }
    apiClient
      .resolveMediaUrl(activeMedia.content_url)
      .then((u) => { if (!cancelled) setPlaybackSrc(u); })
      .catch(() => { if (!cancelled) setPlaybackSrc(activeMedia.content_url); });
    return () => { cancelled = true; };
  }, [activeMedia?.content_url]);
  const mediaStartRef = React.useRef<number>(0);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 12,
    total_pages: 0
  });

  const contentTypeIcons = {
    all: Archive,
    video: Video,
    document: FileText,
    audio: Headphones,
    image: Image,
    interactive: Archive
  };

  useEffect(() => {
    const checkAuth = async () => {
      if (!isAuthenticated()) {
        router.push('/auth');
        return;
      }

      try {
        const userData = await getCurrentUser();
        if (!userData || userData.role !== 'student') {
          router.push('/');
          return;
        }
        
        setUser({
          id: userData.id,
          email: userData.email,
          first_name: userData.profile?.first_name || '',
          last_name: userData.profile?.last_name || '',
          role: userData.role
        });
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/auth');
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (user) {
      loadContentData();
      loadCategoriesData();
      loadWishlist();
    }
  }, [user]);

  const loadWishlist = async () => {
    try {
      const res = await apiClient.getStudentWishlist();
      setWishlistedCourseIds(new Set((res?.data || []).map((w) => w.course_id)));
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    }
  };

  const toggleWishlist = async (courseId: string) => {
    if (!courseId || wishlistBusyId) return;
    setWishlistBusyId(courseId);
    const alreadyWishlisted = wishlistedCourseIds.has(courseId);
    try {
      if (alreadyWishlisted) {
        await apiClient.removeFromWishlist(courseId);
        setWishlistedCourseIds((prev) => {
          const next = new Set(prev);
          next.delete(courseId);
          return next;
        });
      } else {
        await apiClient.addToWishlist(courseId);
        setWishlistedCourseIds((prev) => new Set(prev).add(courseId));
      }
    } catch (error) {
      console.error('Failed to update wishlist:', error);
    } finally {
      setWishlistBusyId(null);
    }
  };

  useEffect(() => {
    if (user) {
      setCurrentPage(1);
      loadContentData();
    }
  }, [searchQuery, selectedCategory, selectedType, selectedAccessLevel, user]);

  useEffect(() => {
    if (user && currentPage > 1) {
      loadContentData();
    }
  }, [currentPage, user]);

  const loadContentData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = {
        search: searchQuery,
        category: selectedCategory,
        content_type: selectedType,
        access_level: selectedAccessLevel,
        page: currentPage,
        limit: pagination.limit
      };

      const response = await apiClient.getContentLibrary(params);

      if (response.success) {
        const content = Array.isArray(response.data?.content) ? response.data.content : [];
        setContentItems(content);
        setPagination(response.data?.pagination || {
          total: content.length,
          page: 1,
          limit: 12,
          total_pages: 1
        });
      } else {
        setContentItems([]);
        setError('Failed to load content library');
      }
    } catch (error) {
      console.error('Error loading content:', error);
      setContentItems([]);
      setError('Failed to load content library');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategoriesData = async () => {
    try {
      const response = await apiClient.getContentCategories();

      if (response.success) {
        const categoriesData = Array.isArray(response.data?.categories) ? response.data.categories : [];
        const contentTypesData = Array.isArray(response.data?.content_types) ? response.data.content_types : [];
        const accessLevelsData = Array.isArray(response.data?.access_levels) ? response.data.access_levels : [];

        setCategories([
          { id: '', name: 'All Categories', count: 0 },
          ...categoriesData
        ]);

        setContentTypes([
          { id: '', name: 'All Types', count: 0 },
          ...contentTypesData
        ]);

        setAccessLevels([
          { id: '', name: 'All Access', count: 0 },
          ...accessLevelsData
        ]);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleDownload = async (contentId: string, contentUrl: string) => {
    try {
      setIsLoadingAction(true);

      const resolved = await apiClient.resolveMediaUrl(contentUrl);
      window.open(resolved, '_blank');

      await apiClient.updateContentProgress(contentId, {
        progress_percentage: 1,
        time_spent_minutes: 1
      });

      await loadContentData();
    } catch (error) {
      console.error('Error downloading content:', error);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleProgressUpdate = async (contentId: string, progress: number) => {
    try {
      await apiClient.updateContentProgress(contentId, {
        progress_percentage: progress,
        time_spent_minutes: Math.floor(progress / 10)
      });

      setContentItems(prev => prev.map(item => 
        item.id === contentId 
          ? { ...item, progress_percentage: progress }
          : item
      ));
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return Video;
      case 'document': return FileText;
      case 'audio': return Headphones;
      case 'image': return Image;
      case 'interactive': return Archive;
      default: return Archive;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video': return 'text-coral bg-coral/15';
      case 'document': return 'text-terracotta bg-terracotta/15';
      case 'audio': return 'text-coral bg-coral/15';
      case 'image': return 'text-forest bg-forest/15';
      case 'interactive': return 'text-terracotta bg-orange-100';
      default: return 'text-espresso/70 bg-cream-100';
    }
  };

  const getAccessIcon = (accessLevel: string, hasAccess: boolean) => {
    if (!hasAccess && accessLevel === 'premium') {
      return Lock;
    }
    return hasAccess ? Unlock : CheckCircle;
  };

  const getAccessColor = (accessLevel: string, hasAccess: boolean) => {
    if (!hasAccess && accessLevel === 'premium') {
      return 'text-coral bg-coral/15';
    }
    if (accessLevel === 'premium') {
      return 'text-mustard-500 bg-mustard/20';
    }
    return 'text-forest bg-forest/15';
  };

  const ContentSkeleton = () => (
    <div className="clay-card clay-card-hover overflow-hidden animate-pulse">
      <div className="h-48 bg-cream-300" />
      <div className="p-6">
        <div className="h-4 bg-cream-300 rounded mb-2" />
        <div className="h-3 bg-cream-300 rounded mb-3 w-2/3" />
        <div className="h-3 bg-cream-300 rounded mb-4" />
        <div className="h-2 bg-cream-300 rounded mb-4" />
        <div className="flex space-x-2">
          <div className="flex-1 h-8 bg-cream-300 rounded" />
          <div className="w-8 h-8 bg-cream-300 rounded" />
          <div className="w-8 h-8 bg-cream-300 rounded" />
        </div>
      </div>
    </div>
  );

  if (!user || isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation 
          userRole="student" 
          userName="Loading..." 
          userEmail="" 
        />
        <DashboardSidebar userRole="student" />
        
        <div className="pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <PageHeader title="Your" accent="learning stash" body="Loading your content library…" eyebrow="Library" />
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <ContentSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole="student" 
        userName={`${user.first_name} ${user.last_name}`}
        userEmail={user.email} 
      />
      <DashboardSidebar userRole="student" />
      
      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <PageHeader
              eyebrow="Library"
              title="Your"
              accent="learning stash"
              body="Lessons, videos, worksheets — every resource your teachers have published, in one place."
            />
            <p className="sr-only">Access all your learning materials, resources, and downloads in one place.</p>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <div className="clay-card p-6">
              {}
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-espresso/45" />
                <input
                  type="text"
                  placeholder="Search content, instructors, or topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="clay-input w-full pl-10 pr-4 py-3 text-lg"
                />
              </div>

              {}
              {error && (
                <div className="mb-6 p-4 bg-coral/15 border border-red-300 text-coral rounded-lg">
                  {error}
                  <button 
                    onClick={loadContentData}
                    className="ml-2 text-coral hover:text-coral underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {}
              <div className="grid md:grid-cols-3 gap-6">
                {}
                <div>
                  <label className="block text-sm font-medium text-espresso mb-2">Categories</label>
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full appearance-none clay-input py-2 pl-4 pr-10 text-sm bg-cream-50 rounded-lg transition-all focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} {category.count > 0 && `(${category.count})`}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                      <svg className="w-5 h-5 text-espresso/55" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {}
                <div>
                  <label className="block text-sm font-medium text-espresso mb-2">Content Types</label>
                  <div className="relative">
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full appearance-none clay-input py-2 pl-4 pr-10 text-sm bg-cream-50 rounded-lg transition-all focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      {contentTypes.map((type) => {
                        const Icon = contentTypeIcons[type.id as keyof typeof contentTypeIcons] || Archive;
                        return (
                          <option key={type.id} value={type.id}>
                            {type.name} {type.count > 0 && `(${type.count})`}
                          </option>
                        );
                      })}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                      <svg className="w-5 h-5 text-espresso/55" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {}
                <div>
                  <label className="block text-sm font-medium text-espresso mb-2">Access Level</label>
                  <div className="relative">
                    <select
                      value={selectedAccessLevel}
                      onChange={(e) => setSelectedAccessLevel(e.target.value)}
                      className="w-full appearance-none clay-input py-2 pl-4 pr-10 text-sm bg-cream-50 rounded-lg transition-all focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      {accessLevels.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.name} {level.count > 0 && `(${level.count})`}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                      <svg className="w-5 h-5 text-espresso/55" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6 flex items-center justify-between"
          >
            <p className="text-espresso/70">
              Showing {contentItems.length} of {pagination.total} results
              {searchQuery && ` for "${searchQuery}"`}
            </p>
            
            {pagination.total_pages > 1 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="clay-card px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-espresso/70">
                  Page {currentPage} of {pagination.total_pages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(pagination.total_pages, currentPage + 1))}
                  disabled={currentPage === pagination.total_pages}
                  className="clay-card px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {contentItems.map((item, index) => {
              const TypeIcon = getTypeIcon(item.content_type);
              const AccessIcon = getAccessIcon(item.access_level, item.has_access);
              
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -5 }}
                  className="clay-card clay-card-hover overflow-hidden"
                >
                  {}
                  <div className="relative h-48">
                    <img 
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=e2e8f0&color=64748b&size=400x300`;
                      }}
                    />
                    <div className="absolute top-4 left-4">
                      <span className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(item.content_type)}`}>
                        <TypeIcon className="w-3 h-3" />
                        <span>{item.content_type.toUpperCase()}</span>
                      </span>
                    </div>
                    <div className="absolute top-4 right-4">
                      <span className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getAccessColor(item.access_level, item.has_access)}`}>
                        <AccessIcon className="w-3 h-3" />
                        <span>{item.access_level.toUpperCase()}</span>
                      </span>
                    </div>
                    
                    {}
                    <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (!item.has_access) return;
                          if (item.content_type === 'video' || item.content_type === 'audio') {
                            mediaStartRef.current = Date.now();
                            setActiveMedia(item);
                          } else {
                            window.open(item.content_url, '_blank');
                            handleProgressUpdate(item.id, Math.max(item.progress_percentage, 10));
                          }
                        }}
                        disabled={!item.has_access}
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          item.has_access 
                            ? 'bg-cream-50 bg-opacity-90 cursor-pointer' 
                            : 'bg-espresso/30 bg-opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {item.content_type === 'video' || item.content_type === 'audio' ? (
                          <Play className="w-5 h-5 text-espresso ml-1" />
                        ) : (
                          <Eye className="w-5 h-5 text-espresso" />
                        )}
                      </motion.button>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-lg font-bold text-espresso line-clamp-2 flex-1">
                        {item.title}
                      </h3>
                      {}
                      <ReadAloudButton
                        getText={() => `${item.title}. ${item.description || ''}`}
                        compact
                      />
                    </div>

                    <p className="text-espresso/70 text-sm mb-1">
                      by {item.teacher_name}
                    </p>

                    <p className="text-terracotta text-sm mb-3">
                      {item.course_title}
                    </p>

                    <p className="text-espresso/70 text-sm mb-4 line-clamp-2">
                      {item.description}
                    </p>

                    {}
                    {item.progress_percentage > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-espresso/55">Progress</span>
                          <span className="text-xs text-espresso/55">{item.progress_percentage}%</span>
                        </div>
                        <div className="w-full bg-cream-300 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${item.progress_percentage}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {}
                    <div className="flex items-center justify-between mb-4 text-sm text-espresso/55">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{item.duration}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Eye className="w-4 h-4" />
                          <span>{item.total_enrollments}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        <span>{item.teacher_rating.toFixed(1)}</span>
                      </div>
                    </div>

                    {}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {item.subject_name && (
                        <span className="clay-card px-2 py-1 text-xs text-espresso/70">
                          {item.subject_name}
                        </span>
                      )}
                      {item.subject_category && (
                        <span className="clay-card px-2 py-1 text-xs text-espresso/70">
                          {item.subject_category}
                        </span>
                      )}
                      <span className="clay-card px-2 py-1 text-xs text-espresso/70">
                        {item.file_size}
                      </span>
                    </div>

                    {}
                    <div className="flex space-x-2">
                      <motion.button
                        whileHover={{ scale: item.has_access && item.is_downloadable ? 1.05 : 1 }}
                        whileTap={{ scale: item.has_access && item.is_downloadable ? 0.95 : 1 }}
                        onClick={() => {
                          if (item.has_access && item.is_downloadable) {
                            handleDownload(item.id, item.content_url);
                          }
                        }}
                        disabled={!item.has_access || !item.is_downloadable || isLoadingAction}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 ${
                          item.has_access && item.is_downloadable
                            ? 'bg-forest text-white hover:bg-forest-400'
                            : 'bg-cream-300 text-espresso/55 cursor-not-allowed'
                        }`}
                      >
                        {isLoadingAction ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        <span>
                          {!item.has_access ? 'Enroll to Access' : 
                           !item.is_downloadable ? 'View Only' : 'Download'}
                        </span>
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => toggleWishlist(item.course_id)}
                        disabled={!item.course_id || wishlistBusyId === item.course_id}
                        className={`clay-card p-2 transition-colors disabled:opacity-50 ${
                          wishlistedCourseIds.has(item.course_id)
                            ? 'text-coral'
                            : 'text-espresso/70 hover:text-coral'
                        }`}
                        title={wishlistedCourseIds.has(item.course_id) ? 'Remove from wishlist' : 'Add to wishlist'}
                      >
                        <Heart className={`w-4 h-4 ${wishlistedCourseIds.has(item.course_id) ? 'fill-current' : ''}`} />
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="clay-card p-2 text-espresso/70 hover:text-terracotta transition-colors"
                        title="Share content"
                      >
                        <Share className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {}
          {!isLoading && contentItems.length === 0 && (
            <EmptyState
              illustration={error ? 'server-error' : 'empty-courses'}
              title={error ? 'Failed to load content' : 'Nothing here yet'}
              body={error
                ? 'There was an error loading the content library. Please try again.'
                : 'Try adjusting your search or filter, or check back later for new content.'}
              actions={error && (
                <button onClick={loadContentData} className="btn-kid-primary">Try again</button>
              )}
            />
          )}

          {}
          {isLoading && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <ContentSkeleton key={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {}
      {activeMedia && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeMedia.title}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setActiveMedia(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-cream-50 rounded-2xl shadow-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold truncate">{activeMedia.title}</h2>
              <button
                onClick={() => setActiveMedia(null)}
                className="text-espresso/55 hover:text-espresso px-2 py-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <VideoPlayer
                src={playbackSrc || activeMedia.content_url}
                title={activeMedia.title}
                onProgress={(pos, dur) => {
                  if (!dur || !isFinite(dur)) return;
                  const pct = Math.min(100, Math.round((pos / dur) * 100));
                  const elapsedMin = Math.max(
                    0,
                    Math.floor((Date.now() - mediaStartRef.current) / 60_000),
                  );
                  apiClient
                    .updateContentProgress(activeMedia.id, {
                      progress_percentage: pct,
                      time_spent_minutes: elapsedMin,
                    })
                    .catch(() => {});
                  setContentItems((prev) =>
                    prev.map((it) =>
                      it.id === activeMedia.id
                        ? { ...it, progress_percentage: pct }
                        : it,
                    ),
                  );
                }}
                onComplete={() => {
                  apiClient
                    .updateContentProgress(activeMedia.id, {
                      progress_percentage: 100,
                      time_spent_minutes: Math.max(
                        0,
                        Math.floor((Date.now() - mediaStartRef.current) / 60_000),
                      ),
                      is_completed: true,
                    })
                    .catch(() => {});
                  setContentItems((prev) =>
                    prev.map((it) =>
                      it.id === activeMedia.id
                        ? { ...it, progress_percentage: 100, is_completed: true }
                        : it,
                    ),
                  );
                }}
                initialAudioOnly={activeMedia.content_type === 'audio'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentContentLibraryPage;