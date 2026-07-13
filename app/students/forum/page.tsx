'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, isAuthenticated, getCurrentUser } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ReadAloudButton } from '@/components/accessibility/ReadAloudButton';
import { DictateButton } from '@/components/accessibility/DictateButton';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { 
  Plus, 
  Search, 
  Filter, 
  MessageSquare, 
  ThumbsUp, 
  MessageCircle, 
  User, 
  Clock, 
  Tag,
  X,
  BookOpen,
  Code,
  Lightbulb,
  HelpCircle,
  TrendingUp,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle,
  Star,
  Pin,
  Flag,
  Eye,
  BarChart3,
  ThumbsDown,
  Image
} from 'lucide-react';

const StudentForumPage = () => {
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    category: 'questions',
    tags: ''
  });
  const [newPostImageUrl, setNewPostImageUrl] = useState<string>('');
  const [newPostA11yTags, setNewPostA11yTags] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');

  const A11Y_TAG_OPTIONS = [
    { id: 'sign_language_friendly', label: 'Sign-language friendly' },
    { id: 'screen_reader_friendly', label: 'Screen-reader friendly' },
    { id: 'plain_language', label: 'Plain language' },
    { id: 'large_text_ok', label: 'Large text OK' },
  ];

  const [forumPosts, setForumPosts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [forumStats, setForumStats] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState<any>({});

  const [authenticated, setAuthenticated] = useState(false);
  const currentUser = getCurrentUser();

  const newPostRef = useFocusTrap<HTMLDivElement>(
    showNewPostForm,
    () => setShowNewPostForm(false),
  );

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    
    setAuthenticated(true);
  }, [router]);

  const loadForumData = async () => {
    if (!authenticated) return;

    setIsLoading(true);
    setError('');

    try {
      const [categoriesResult, statsResult, postsResult] = await Promise.allSettled([
        apiClient.getForumCategories(),
        apiClient.getForumStats(),
        apiClient.getForumPosts({
          search: searchQuery,
          category: selectedCategory,
          sort_by: sortBy,
          page: 1,
          limit: 20
        })
      ]);

      if (categoriesResult.status === 'fulfilled') {
        const catRes = categoriesResult.value;
        let categoriesData: any[] = [];
        if (catRes?.success && Array.isArray(catRes.data)) {
          categoriesData = catRes.data;
        } else if (Array.isArray(catRes?.categories)) {
          categoriesData = catRes.categories;
        } else if (Array.isArray(catRes)) {
          categoriesData = catRes;
        }
        setCategories(categoriesData);
      } else {
        setCategories([]);
      }

      if (statsResult.status === 'fulfilled') {
        const statRes = statsResult.value;
        if (statRes?.success) {
          setForumStats(statRes.data || {});
        } else {
          setForumStats(statRes || {});
        }
      } else {
        setForumStats({});
      }

      if (postsResult.status === 'fulfilled') {
        const postRes = postsResult.value;
        let postsData: any[] = [];
        let paginationData = {};

        if (postRes?.success && postRes?.data) {
          postsData = Array.isArray(postRes.data?.posts) ? postRes.data.posts : [];
          paginationData = postRes.data?.pagination || {};
        } else if (Array.isArray(postRes?.posts)) {
          postsData = postRes.posts;
          paginationData = postRes.pagination || {};
        } else if (Array.isArray(postRes)) {
          postsData = postRes;
        }

        setForumPosts(postsData);
        setPagination(paginationData);
      } else {
        setForumPosts([]);
        setPagination({});
      }

    } catch (err: any) {
      console.error('Error loading forum data:', err);
      setCategories([]);
      setForumPosts([]);
      setError('Failed to load forum data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadForumData();
  }, [authenticated, selectedCategory, searchQuery, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (authenticated) {
        loadForumData();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getCategoryIcon = (categoryId: string) => {
    const iconMap: any = {
      'all': MessageSquare,
      'questions': HelpCircle,
      'discussions': MessageCircle,
      'tips': Lightbulb,
      'announcements': AlertCircle,
      'solved': CheckCircle
    };
    return iconMap[categoryId] || MessageSquare;
  };

  const getCategoryColor = (categoryId: string) => {
    const colors = {
      questions: 'text-terracotta bg-terracotta/15',
      discussions: 'text-forest bg-forest/15',
      tips: 'text-mustard-500 bg-mustard/20',
      announcements: 'text-coral bg-coral/15',
      solved: 'text-coral bg-coral/15'
    };
    return colors[categoryId as keyof typeof colors] || 'text-espresso/70 bg-cream-100';
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPost.title.trim() || !newPost.content.trim()) {
      return;
    }

    setIsCreating(true);
    
    try {
      const tagsArray = newPost.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      const result = await apiClient.createForumPost({
        title: newPost.title,
        content: newPost.content,
        category: newPost.category,
        tags: tagsArray,
        accessibility_tags: newPostA11yTags,
        image_url: newPostImageUrl || undefined,
      } as any);

      if (result.success) {
        setShowNewPostForm(false);
        setNewPost({ title: '', content: '', category: 'questions', tags: '' });
        setNewPostA11yTags([]);
        setNewPostImageUrl('');
        setUploadError('');
        await loadForumData();
      }

    } catch (err: any) {
      console.error('Error creating post:', err);
      setError('Failed to create post. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleImageUpload = async (file: File | null) => {
    setUploadError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be under 5 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are allowed');
      return;
    }
    const supa = getBrowserSupabase();
    if (!supa) {
      setUploadError('Image upload is not available in this environment.');
      return;
    }
    setUploadingImage(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${currentUser?.id || 'anon'}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error } = await supa.storage
        .from('forum-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) {
        setUploadError(error.message || 'Upload failed');
        return;
      }
      const { data } = supa.storage.from('forum-images').getPublicUrl(path);
      setNewPostImageUrl(data.publicUrl);
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleVote = async (postId: string, voteType: 'upvote' | 'downvote') => {
    try {
      const result = await apiClient.voteOnPost(postId, voteType);

      if (result.success) {
        setForumPosts(prevPosts => 
          prevPosts.map(post => 
            post.id === postId 
              ? { ...post, userVote: result.data.userVote }
              : post
          )
        );
      }

    } catch (err: any) {
      console.error('Error voting:', err);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return 'Unknown time';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffInDays < 7) return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation 
        userRole="student" 
        userName={currentUser ? `${currentUser.profile?.first_name || ''} ${currentUser.profile?.last_name || ''}`.trim() || "Student" : "Student"} 
        userEmail={currentUser?.email || "student@skillhub.com"} 
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
            <div className="flex items-center justify-between">
              <div>
                <PageHeader title="Ask, answer," accent="belong" />
                <p className="text-espresso/70">
                  Ask questions, share knowledge, and connect with the learning community.
                </p>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowNewPostForm(true)}
                className="clay-card bg-forest text-white px-6 py-3 flex items-center space-x-2 hover:bg-forest-400 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>New Post</span>
              </motion.button>
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-4 gap-8">
            {}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <div className="clay-card p-6 sticky top-24">
                <h3 className="text-lg font-bold text-espresso mb-4">Categories</h3>
                
                <div className="space-y-2">
                  {isLoading ? (
                    Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-cream-300">
                          <div className="flex items-center space-x-3">
                            <div className="w-4 h-4 bg-cream-300 rounded"></div>
                            <div className="w-20 h-4 bg-cream-300 rounded"></div>
                          </div>
                          <div className="w-8 h-5 bg-cream-300 rounded-full"></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    categories.map((category) => {
                      const Icon = getCategoryIcon(category.id);
                    return (
                      <motion.button
                        key={category.id}
                        whileHover={{ x: 5 }}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                          selectedCategory === category.id
                            ? 'bg-forest text-white'
                            : 'text-espresso hover:bg-cream-100'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="w-4 h-4" />
                          <span className="text-sm font-medium">{category.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          selectedCategory === category.id
                            ? 'bg-cream-50 bg-opacity-20'
                            : 'bg-cream-300'
                        }`}>
                          {category.count}
                        </span>
                      </motion.button>
                    );
                    })
                  )}
                </div>

                {}
                <div className="mt-8 pt-6 border-t border-espresso/15">
                  <h4 className="text-sm font-bold text-espresso mb-4">Forum Stats</h4>
                  <div className="space-y-3 text-sm">
                    {isLoading ? (
                      Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="animate-pulse flex items-center justify-between">
                          <div className="w-20 h-4 bg-cream-300 rounded"></div>
                          <div className="w-8 h-4 bg-cream-300 rounded"></div>
                        </div>
                      ))
                    ) : (
                      <>
                    <div className="flex items-center justify-between">
                      <span className="text-espresso/70">Total Posts</span>
                          <span className="font-medium">{forumStats.totalPosts || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-espresso/70">Active Users</span>
                          <span className="font-medium">{forumStats.activeUsers || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-espresso/70">Solved Questions</span>
                          <span className="font-medium">{forumStats.solvedQuestions || 0}</span>
                    </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3"
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
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {}
              <div className="clay-card p-6 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                  {}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-espresso/45" />
                    <input
                      type="text"
                      placeholder="Search posts, topics, or tags..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="clay-input w-full pl-10 pr-4 py-3"
                    />
                  </div>

                  {}
                  <div className="flex items-center space-x-2">
                    <Filter className="w-5 h-5 text-espresso/45" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="clay-input px-4 py-3"
                    >
                      <option value="recent">Most Recent</option>
                      <option value="popular">Most Popular</option>
                      <option value="unanswered">Unanswered</option>
                      <option value="solved">Solved</option>
                    </select>
                  </div>
                </div>
              </div>

              {}
              <div className="space-y-4">
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="animate-pulse clay-card p-6">
                      <div className="flex space-x-4">
                        <div className="w-12 h-12 bg-cream-300 rounded-full flex-shrink-0"></div>
                        <div className="flex-1 space-y-3">
                          <div className="h-6 bg-cream-300 rounded w-3/4"></div>
                          <div className="space-y-2">
                            <div className="h-4 bg-cream-300 rounded w-full"></div>
                            <div className="h-4 bg-cream-300 rounded w-2/3"></div>
                          </div>
                          <div className="flex space-x-4">
                            <div className="h-4 bg-cream-300 rounded w-16"></div>
                            <div className="h-4 bg-cream-300 rounded w-16"></div>
                            <div className="h-4 bg-cream-300 rounded w-16"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : forumPosts.map((post, index) => {
                  const CategoryIcon = getCategoryIcon(post.category);
                  return (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -2 }}
                      onClick={() => router.push(`/students/forum/${post.id}`)}
                      className="clay-card clay-card-hover p-6 relative cursor-pointer"
                    >
                      {}
                      {post.isPinned && (
                        <div className="absolute top-4 right-4">
                          <Pin className="w-4 h-4 text-mustard-500" />
                        </div>
                      )}

                      <div className="flex space-x-4">
                        {}
                        <img 
                          src={post.author.avatar}
                          alt={post.author.name}
                          className="w-12 h-12 clay-card object-cover flex-shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          {}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-espresso mb-1 line-clamp-2">
                                {post.title}
                              </h3>
                              
                              <div className="flex items-center space-x-4 text-sm text-espresso/55">
                                <div className="flex items-center space-x-1">
                                  <span className="font-medium text-espresso">{post.author.name}</span>
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    post.author.role === 'Teacher' 
                                      ? 'bg-terracotta/15 text-terracotta' 
                                      : 'bg-forest/15 text-forest'
                                  }`}>
                                    {post.author.role}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Star className="w-3 h-3 text-yellow-500" />
                                  <span>{post.author.reputation}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Clock className="w-3 h-3" />
                                <span>{formatRelativeTime(post.createdAt)}</span>
                                </div>
                              </div>
                            </div>

                            {}
                            <span className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(post.category)}`}>
                              <CategoryIcon className="w-3 h-3" />
                              <span>{post.category.charAt(0).toUpperCase() + post.category.slice(1)}</span>
                            </span>
                          </div>

                          {}
                          <p className="text-espresso/70 mb-4 line-clamp-2">
                            {post.content}
                          </p>

                          {}
                          {post.imageUrl && (
                            <img
                              src={post.imageUrl}
                              alt={post.title}
                              loading="lazy"
                              className="mb-4 max-h-56 rounded-md border object-cover"
                            />
                          )}

                          {}
                          <div className="flex flex-wrap gap-2 mb-4">
                            {(Array.isArray(post.tags) ? post.tags : []).map((tag: string) => (
                              <span
                                key={tag}
                                className="clay-card px-2 py-1 text-xs text-espresso/70 hover:text-espresso cursor-pointer"
                              >
                                #{tag}
                              </span>
                            ))}
                            {}
                            {(Array.isArray(post.accessibilityTags)
                              ? post.accessibilityTags
                              : []
                            ).map((tag: string) => (
                              <span
                                key={`a11y-${tag}`}
                                className="px-2 py-1 text-xs bg-forest/10 text-forest-500 border border-forest/30 rounded"
                                title="Accessibility tag"
                              >
                                ♿ {tag.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>

                          {}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-6 text-sm text-espresso/55">
                              <div className="flex items-center space-x-1">
                                <ThumbsUp className="w-4 h-4" />
                                <span>{post.upvotes}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <MessageCircle className="w-4 h-4" />
                                <span>{post.replies}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Eye className="w-4 h-4" />
                                <span>{post.views}</span>
                              </div>
                              
                              {}
                              <div className="flex items-center space-x-2">
                                {post.isSolved && (
                                  <CheckCircle className="w-4 h-4 text-forest" />
                                )}
                                {post.hasImage && (
                                  <Image className="w-4 h-4 text-terracotta" />
                                )}
                                {post.hasPoll && (
                                  <BarChart3 className="w-4 h-4 text-coral" />
                                )}
                              </div>
                            </div>

                            {}
                            <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                              {}
                              <ReadAloudButton
                                getText={() => `${post.title}. ${post.content || ''}`}
                                compact
                              />
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVote(post.id, 'upvote');
                                }}
                                className={`clay-card p-2 transition-colors ${
                                  post.userVote === 'upvote'
                                    ? 'text-forest bg-forest/10'
                                    : 'text-espresso/70 hover:text-forest'
                                }`}
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </motion.button>
                              
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVote(post.id, 'downvote');
                                }}
                                className={`clay-card p-2 transition-colors ${
                                  post.userVote === 'downvote'
                                    ? 'text-coral bg-coral/10'
                                    : 'text-espresso/70 hover:text-coral'
                                }`}
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </motion.button>
                              
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/students/forum/${post.id}`);
                                }}
                                className="clay-card p-2 text-espresso/70 hover:text-terracotta transition-colors"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </motion.button>
                              
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const reason = window.prompt(
                                    'Why are you reporting this post? (spam / harassment / hate_speech / inappropriate / misinformation / other)',
                                  );
                                  if (!reason) return;
                                  const description = window.prompt(
                                    'Briefly describe the issue (min 5 chars):',
                                  );
                                  if (!description || description.trim().length < 5) return;
                                  try {
                                    await apiClient.submitReport({
                                      category: reason.trim().toLowerCase(),
                                      description: description.trim(),
                                      reported_post_id: post.id,
                                    });
                                    alert('Report submitted. Thank you.');
                                  } catch (err: any) {
                                    alert(err?.message || 'Failed to submit report.');
                                  }
                                }}
                                className="clay-card p-2 text-espresso/70 hover:text-terracotta transition-colors"
                                title="Report this post"
                                aria-label="Report this post"
                              >
                                <Flag className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {}
              {!isLoading && forumPosts.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12"
                >
                  <MessageSquare className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-espresso/70 mb-2">
                    No posts found
                  </h3>
                  <p className="text-espresso/55 mb-6">
                    Try adjusting your search or filter criteria
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="clay-card bg-forest text-white px-6 py-3 hover:bg-forest-400 transition-colors"
                  >
                    Create First Post
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {}
      <AnimatePresence>
        {showNewPostForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={newPostRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-post-title"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-cream-50 rounded-3xl shadow-kid-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 id="new-post-title" className="text-2xl font-bold text-espresso">Create New Post</h2>
                  <button
                    onClick={() => setShowNewPostForm(false)}
                    className="text-espresso/45 hover:text-espresso/70 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleCreatePost}>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Title *
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          value={newPost.title}
                          onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                          className="flex-1 border border-espresso/20 rounded-md px-3 py-2 focus:ring-2 focus:ring-terracotta focus:border-terracotta"
                          placeholder="Enter title..."
                        />
                        {}
                        <DictateButton
                          value={newPost.title}
                          onChange={(next) => setNewPost(prev => ({ ...prev, title: next }))}
                          compact
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Category *
                      </label>
                      <select
                        required
                        value={newPost.category}
                        onChange={(e) => setNewPost(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full border border-espresso/20 rounded-md px-3 py-2 focus:ring-2 focus:ring-terracotta focus:border-terracotta"
                      >
                        <option value="questions">Questions</option>
                        <option value="discussions">Discussions</option>
                        <option value="tips">Tips & Tricks</option>
                        <option value="announcements">Announcements</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-espresso">
                          Content *
                        </label>
                        <DictateButton
                          value={newPost.content}
                          onChange={(next) => setNewPost(prev => ({ ...prev, content: next }))}
                          compact={false}
                        />
                      </div>
                      <textarea
                        required
                        rows={6}
                        value={newPost.content}
                        onChange={(e) => setNewPost(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full border border-espresso/20 rounded-md px-3 py-2 focus:ring-2 focus:ring-terracotta focus:border-terracotta"
                        placeholder="Enter content..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Tags
                      </label>
                      <input
                        type="text"
                        value={newPost.tags}
                        onChange={(e) => setNewPost(prev => ({ ...prev, tags: e.target.value }))}
                        className="w-full border border-espresso/20 rounded-md px-3 py-2 focus:ring-2 focus:ring-terracotta focus:border-terracotta"
                        placeholder="Enter tags (e.g., React, JavaScript)"
                      />
                      <p className="text-xs text-espresso/55 mt-1">
                        Separate multiple tags with commas.
                      </p>
                    </div>

                    {}
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Accessibility tags
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {A11Y_TAG_OPTIONS.map((opt) => {
                          const checked = newPostA11yTags.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setNewPostA11yTags((tags) =>
                                    checked
                                      ? tags.filter((t) => t !== opt.id)
                                      : [...tags, opt.id],
                                  )
                                }
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-espresso/55 mt-1">
                        Helps students filter for threads that fit their needs.
                      </p>
                    </div>

                    {}
                    <div>
                      <label className="block text-sm font-medium text-espresso mb-2">
                        Image (optional)
                      </label>
                      {newPostImageUrl ? (
                        <div className="space-y-2">
                          <img
                            src={newPostImageUrl}
                            alt="Selected attachment"
                            className="max-h-48 rounded-md border"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setNewPostImageUrl('');
                              setUploadError('');
                            }}
                            className="text-xs text-coral hover:underline"
                          >
                            Remove image
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleImageUpload(e.target.files?.[0] || null)
                          }
                          disabled={uploadingImage}
                          className="block w-full text-sm text-espresso file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-espresso/20 file:text-sm file:bg-cream-50"
                        />
                      )}
                      {uploadingImage && (
                        <p className="text-xs text-espresso/55 mt-1">Uploading...</p>
                      )}
                      {uploadError && (
                        <p className="text-xs text-coral mt-1">{uploadError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowNewPostForm(false)}
                      className="px-4 py-2 text-espresso/70 hover:text-espresso"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="bg-forest text-white px-4 py-2 rounded-md shadow-sm hover:bg-forest-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreating ? 'Creating...' : 'Create Post'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentForumPage;