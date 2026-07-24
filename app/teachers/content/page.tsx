'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from '@/hooks/use-translation';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { UploadProgress } from '@/components/ui/upload-progress';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload,
  Search, 
  Filter, 
  Plus,
  FolderPlus,
  FileText,
  Video,
  Image as ImageIcon,
  Download,
  Eye,
  Edit,
  Trash2,
  Star,
  Clock,
  Users,
  BookOpen,
  Folder,
  File,
  Grid,
  List,
  SortAsc,
  MoreVertical,
  Play,
  X,
} from 'lucide-react';

interface CourseContent {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  content_type: string;
  content_url?: string;
  thumbnail_url?: string;
  duration?: string;
  file_size?: string;
  access_level: string;
  order_index?: number;
  is_downloadable: boolean;
  created_at: string;
}

interface Course {
  id: string;
  teacher_id: string;
  title: string;
  description?: string;
  subject_id?: string;
  level?: string;
  duration_weeks?: number;
  price?: number;
  original_price?: number;
  max_students?: number;
  status: string;
  thumbnail_url?: string;
  is_featured: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
  subject?: {
    name: string;
    category: string;
  };
}

interface ContentData {
  content_items: CourseContent[];
  total_count: number;
  course: Course;
}

interface CoursesData {
  courses: Course[];
  total_count: number;
  active_count: number;
  draft_count: number;
  published_count: number;
}

interface ContentStats {
  totalFiles: number;
  totalDownloads: number;
  totalViews: number;
  totalFolders: number;
}

const TeacherContentPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  const [coursesData, setCoursesData] = useState<CoursesData | null>(null);
  const [contentData, setContentData] = useState<ContentData | null>(null);
  const [contentStats, setContentStats] = useState<ContentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const onUploadProgress = (pct: number, bps?: number) => {
    setUploadProgress(pct);
    if (bps != null) setUploadSpeed(bps);
  };
  const [createFolderLoading, setCreateFolderLoading] = useState(false);
  const [createFolderError, setCreateFolderError] = useState('');

  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    content_type: 'document',
    access_level: 'free',
    is_downloadable: true,
    file: null as File | null,
    thumbnail: null as File | null,
  });

  // Video player modal + resolved thumbnail previews for the content list.
  const [playing, setPlaying] = useState<CourseContent | null>(null);
  const [playingSrc, setPlayingSrc] = useState('');
  const [playerLoading, setPlayerLoading] = useState(false);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  // Edit / delete content item.
  const [editingItem, setEditingItem] = useState<CourseContent | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', access_level: 'free', is_downloadable: true });
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [folderForm, setFolderForm] = useState({
    title: '',
    description: '',
    level: 'beginner',
    status: 'draft',
    price: 0
  });

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }

    if (currentUser?.role !== 'teacher') {
      router.push('/auth');
      return;
    }

    fetchContentData();
  }, [router, currentUser?.role]);

  const fetchContentData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const courses = await apiClient.getTeacherCourses();
      setCoursesData(courses);

      const stats: ContentStats = {
        totalFiles: 0,
        totalDownloads: 0,
        totalViews: 0,
        totalFolders: courses.total_count
      };
      setContentStats(stats);

    } catch (err: any) {
      console.error('Error fetching content:', err);
      setError(err.message || 'Failed to load content data');
      
      setCoursesData({
        courses: [],
        total_count: 0,
        active_count: 0,
        draft_count: 0,
        published_count: 0
      });
      setContentStats({
        totalFiles: 0,
        totalDownloads: 0,
        totalViews: 0,
        totalFolders: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourseContent = async (courseId: string) => {
    try {
      const [coursesResponse, contentResponse] = await Promise.all([
        apiClient.getTeacherCourses(),
        apiClient.getTeacherContent(courseId, { limit: 100 }),
      ]);

      const realContentData: ContentData = {
        content_items: contentResponse.content || [],
        total_count: contentResponse.total_count || 0,
        course: coursesResponse.courses.find((c: any) => c.id === courseId) || coursesResponse.courses[0]
      };

      setContentData(realContentData);

      if (contentStats) {
        setContentStats({
          ...contentStats,
          totalFiles: realContentData.total_count
        });
      }
    } catch (err: any) {
      console.error('Error fetching course content:', err);
      setError(err.message || 'Failed to load course content');
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      fetchCourseContent(selectedCourse);
    }
  }, [selectedCourse]);

  // Resolve r2:// thumbnails to presigned image URLs for the list previews.
  useEffect(() => {
    const items = contentData?.content_items || [];
    const toResolve = items.filter(
      (it) => it.thumbnail_url && it.thumbnail_url.startsWith('r2://') && !thumbUrls[it.id],
    );
    if (toResolve.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        toResolve.map(async (it) => {
          try {
            return [it.id, await apiClient.resolveMediaUrl(it.thumbnail_url)] as const;
          } catch {
            return [it.id, ''] as const;
          }
        }),
      );
      if (!cancelled) setThumbUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [contentData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open a video/audio item in the player modal; other types open in a new tab.
  const openPlayer = async (item: CourseContent) => {
    if (item.content_type !== 'video' && item.content_type !== 'audio') {
      const url = await apiClient.resolveMediaUrl(item.content_url);
      if (url) window.open(url, '_blank');
      return;
    }
    setPlaying(item);
    setPlayerLoading(true);
    setPlayingSrc('');
    try {
      setPlayingSrc(await apiClient.resolveMediaUrl(item.content_url));
    } catch {
      setPlayingSrc('');
    } finally {
      setPlayerLoading(false);
    }
  };

  const downloadItem = async (item: CourseContent) => {
    try {
      const url = await apiClient.resolveMediaUrl(item.content_url, true); // force download
      if (url) window.open(url, '_blank');
    } catch {
      /* ignore */
    }
  };

  const openEdit = (item: CourseContent) => {
    setEditingItem(item);
    setEditForm({
      title: item.title || '',
      description: item.description || '',
      access_level: item.access_level || 'free',
      is_downloadable: !!item.is_downloadable,
    });
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    setEditSaving(true);
    try {
      await apiClient.updateContentItem(editingItem.id, {
        title: editForm.title.trim(),
        description: editForm.description,
        access_level: editForm.access_level,
        is_downloadable: editForm.is_downloadable,
      });
      setEditingItem(null);
      if (selectedCourse) await fetchCourseContent(selectedCourse);
    } catch (err: any) {
      alert(err?.message || 'Failed to update content');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteItem = async (item: CourseContent) => {
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    setDeletingId(item.id);
    try {
      await apiClient.deleteContent(item.id);
      if (selectedCourse) await fetchCourseContent(selectedCourse);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete content');
    } finally {
      setDeletingId(null);
    }
  };

  const subjects = ['all', 'Mathematics', 'Physics', 'Chemistry', 'English', 'Biology'];
  const contentTypes = ['all', 'video', 'document', 'image', 'presentation', 'audio'];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-12 h-12 text-terracotta" />;
      case 'document': return <FileText className="w-12 h-12 text-forest-300" />;
      case 'image': return <ImageIcon className="w-12 h-12 text-mustard-400" />;
      case 'presentation': return <BookOpen className="w-12 h-12 text-terracotta-500" />;
      case 'audio': return <File className="w-12 h-12 text-coral-300" />;
      default: return <File className="w-12 h-12 text-espresso/55" />;
    }
  };

  const filteredContent = React.useMemo(() => {
    if (!contentData?.content_items) return [];
    
    return contentData.content_items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.content_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || item.content_type === typeFilter;
      const matchesSubject = subjectFilter === 'all';
      
      return matchesSearch && matchesType && matchesSubject;
    });
  }, [contentData, searchQuery, typeFilter, subjectFilter]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm({ ...uploadForm, file });
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadForm.file) {
      setUploadError('Please select a file to upload');
      return;
    }

    if (!selectedCourse) {
      setUploadError('Please select a course/folder first');
      return;
    }

    setUploadLoading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadError('');

    try {
      const file = uploadForm.file!;
      const ct = uploadForm.content_type;
      const isMedia = ct === 'video' || ct === 'audio';
      const formData = new FormData();

      // Video/audio upload straight to R2 (fast, with progress); the big video
      // PUT drives the bar. Images/documents ride the FormData POST.
      if (isMedia) {
        const { key } = await apiClient.uploadMediaToR2(
          file,
          ct === 'audio' ? 'audio' : 'media',
          onUploadProgress,
        );
        formData.append('r2_key', key);
        formData.append('r2_file_size', String(file.size));
      } else {
        formData.append('file', file);
      }

      // Optional thumbnail/preview image → R2 (small, quick).
      if (uploadForm.thumbnail) {
        const { key: thumbKey } = await apiClient.uploadMediaToR2(uploadForm.thumbnail, 'thumbnail');
        formData.append('thumbnail_r2_key', thumbKey);
      }

      formData.append('course_id', selectedCourse);
      formData.append('title', uploadForm.title);
      formData.append('description', uploadForm.description || '');
      formData.append('content_type', ct);
      formData.append('access_level', uploadForm.access_level);
      formData.append('is_downloadable', String(uploadForm.is_downloadable));

      await apiClient.uploadFormWithProgress(
        '/api/v1/teachers/content/upload',
        formData,
        isMedia ? undefined : onUploadProgress,
      );

      setUploadForm({
        title: '',
        description: '',
        content_type: 'document',
        access_level: 'free',
        is_downloadable: true,
        file: null,
        thumbnail: null,
      });
      setShowUploadModal(false);
      
      if (selectedCourse) {
        await fetchCourseContent(selectedCourse);
      }

      toast({
        title: "Success!",
        description: "Content uploaded successfully!",
        variant: "default",
      });
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to upload content');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setCreateFolderLoading(true);
    setCreateFolderError('');

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/teachers/courses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: folderForm.title,
          description: folderForm.description,
          level: folderForm.level,
          status: folderForm.status,
          price: folderForm.price,
          is_featured: false,
          max_students: 100
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create folder');
      }

      const result = await response.json();
      
      setFolderForm({
        title: '',
        description: '',
        level: 'beginner',
        status: 'draft',
        price: 0
      });
      setShowCreateFolderModal(false);
      
      await fetchContentData();

      toast({
        title: "Success!",
        description: "Folder created successfully!",
        variant: "default",
      });
    } catch (err: any) {
      console.error('Create folder error:', err);
      setCreateFolderError(err.message || 'Failed to create folder');
    } finally {
      setCreateFolderLoading(false);
    }
  };

  const renderContentGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filteredContent.map((item) => (
        <motion.div
          key={item.id}
          whileHover={{ scale: 1.02 }}
          className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid border border-espresso/15 overflow-hidden hover:shadow-md transition-shadow"
        >
          <button
            type="button"
            onClick={() => openPlayer(item)}
            className="relative aspect-video w-full bg-cream-100 flex items-center justify-center overflow-hidden group"
            title={item.content_type === 'video' || item.content_type === 'audio' ? 'Play' : 'Open'}
          >
            {thumbUrls[item.id] ? (
              <img src={thumbUrls[item.id]} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              getTypeIcon(item.content_type)
            )}
            {(item.content_type === 'video' || item.content_type === 'audio') && (
              <span className="absolute inset-0 flex items-center justify-center bg-espresso/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="grid place-items-center w-14 h-14 rounded-full bg-cream/90 text-espresso shadow-sticker-sm">
                  <Play className="w-6 h-6 ml-0.5" />
                </span>
              </span>
            )}
          </button>
          <div className="p-4">
            <h3 className="font-semibold text-espresso mb-2 truncate">{item.title}</h3>
            <p className="text-sm text-espresso/70 mb-3 line-clamp-2">{item.description}</p>
            <div className="flex items-center justify-between text-sm text-espresso/55 mb-3">
              <span className="flex items-center text-espresso/55">
                <Download className="w-4 h-4 mr-1" />
                {item.is_downloadable ? (item as any).downloads || 0 : 'N/A'}
              </span>
              <span className="flex items-center text-espresso/55">
                <Eye className="w-4 h-4 mr-1" />
                {(item as any).views || 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button onClick={() => openPlayer(item)} title="Play / open" className="p-1 text-espresso/45 hover:text-terracotta">
                  <Eye className="w-4 h-4" />
                </button>
                {item.is_downloadable && (
                  <button onClick={() => downloadItem(item)} title="Download" className="p-1 text-espresso/45 hover:text-forest">
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button className="p-1 text-espresso/45 hover:text-mustard-500">
                  <Star className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center space-x-1">
                <button className="p-1 text-espresso/45 hover:text-espresso/70">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="p-1 text-espresso/45 hover:text-coral">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  const renderContentList = () => (
    <div className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid border border-espresso/15 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-espresso/15">
          <thead className="bg-cream-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                Content
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                Course
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                Stats
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-cream-50 divide-y divide-espresso/15">
            {filteredContent.map((item) => (
              <tr key={item.id} className="hover:bg-cream-100">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => openPlayer(item)}
                      className="relative shrink-0 w-16 h-10 rounded-md overflow-hidden bg-cream-100 grid place-items-center group"
                      title="Play / open"
                    >
                      {thumbUrls[item.id] ? (
                        <img src={thumbUrls[item.id]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="scale-[0.55]">{getTypeIcon(item.content_type)}</span>
                      )}
                      {(item.content_type === 'video' || item.content_type === 'audio') && (
                        <Play className="absolute w-4 h-4 text-cream drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-espresso">{item.title}</div>
                      <div className="text-sm text-espresso/55 truncate max-w-xs">{item.description}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-espresso">{(item as any).course?.subject?.name || 'N/A'}</span>
                  <div className="text-sm text-espresso/55">{(item as any).course?.level || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                  {item.content_type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-espresso">{(item as any).downloads || 0} downloads</div>
                  <div className="text-sm text-espresso/55">{(item as any).views || 0} views</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                  {new Date(item.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button onClick={() => openPlayer(item)} title="Play / open" className="text-terracotta hover:text-terracotta-700">
                      <Eye className="w-4 h-4" />
                    </button>
                    {item.is_downloadable && (
                      <button onClick={() => downloadItem(item)} title="Download" className="text-forest hover:text-forest-500">
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    <button className="text-espresso/70 hover:text-espresso">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="text-coral hover:text-red-900">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

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
            <div className="flex items-center justify-between mb-8">
              <div>
                <PageHeader title="Your" accent="content library" />
                <p className="text-espresso/70">Manage your teaching materials and resources</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCreateFolderModal(true)}
                  className="flex items-center px-4 py-2 text-espresso bg-cream-50 border border-espresso/20 rounded-lg hover:bg-cream-100"
                >
                  <FolderPlus className="w-4 h-4 mr-2" />
                  New Folder
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center px-4 py-2 text-white bg-terracotta rounded-lg hover:bg-terracotta-500"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Content
                </button>
              </div>
            </div>

            {}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Total Files</p>
                    <p className="text-2xl font-bold text-espresso mt-1">{contentStats?.totalFiles || 0}</p>
                  </div>
                  <File className="h-8 w-8 text-terracotta" />
                </div>
              </div>
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Total Downloads</p>
                    <p className="text-2xl font-bold text-espresso mt-1">
                      {contentStats?.totalDownloads || 0}
                    </p>
                  </div>
                  <Download className="h-8 w-8 text-forest" />
                </div>
              </div>
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Total Views</p>
                    <p className="text-2xl font-bold text-espresso mt-1">
                      {contentStats?.totalViews || 0}
                    </p>
                  </div>
                  <Eye className="h-8 w-8 text-coral" />
                </div>
              </div>
              <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-espresso/70">Folders</p>
                    <p className="text-2xl font-bold text-espresso mt-1">{contentStats?.totalFolders || 0}</p>
                  </div>
                  <Folder className="h-8 w-8 text-terracotta" />
                </div>
              </div>
            </div>

            {}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-espresso mb-4">Folders</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coursesData?.courses.map((course) => (
                  <motion.div
                    key={course.id}
                    whileHover={{ scale: 1.02 }}
                    className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedCourse(course.id)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Folder className="w-8 h-8 text-terracotta" />
                      <button className="text-espresso/45 hover:text-espresso/70">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-espresso mb-2">{course.title}</h3>
                    <p className="text-sm text-espresso/70 mb-3">{course.description}</p>
                    <div className="flex items-center justify-between text-sm text-espresso/55">
                      <span>{(course as any).content_count ?? (course as any).total_count ?? 0} items</span>
                      <span>{new Date(course.created_at).toLocaleDateString()}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {}
            <div className="bg-cream-50 rounded-lg p-6 shadow-sm border border-espresso/15 mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  >
                    {contentTypes.map(type => (
                      <option key={type} value={type}>
                        {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  >
                    {subjects.map(subject => (
                      <option key={subject} value={subject}>
                        {subject === 'all' ? 'All Subjects' : subject}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  >
                    <option value="recent">Recent</option>
                    <option value="name">Name</option>
                    <option value="downloads">Downloads</option>
                    <option value="views">Views</option>
                  </select>
                  <div className="flex border border-espresso/20 rounded-lg">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 ${viewMode === 'grid' ? 'bg-cream-100' : ''}`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 ${viewMode === 'list' ? 'bg-cream-100' : ''}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {}
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-espresso/55">Loading content...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-500">
                <p>{error}</p>
                <button onClick={fetchContentData} className="mt-4 px-4 py-2 text-white bg-terracotta rounded-lg hover:bg-terracotta-500">
                  Retry
                </button>
              </div>
            ) : filteredContent && filteredContent.length > 0 ? (
              <>
                {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredContent.map((item) => (
                    <motion.div
                      key={item.id}
                      whileHover={{ scale: 1.02 }}
                      className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid border border-espresso/15 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <button
                        type="button"
                        onClick={() => openPlayer(item)}
                        className="relative aspect-video w-full bg-cream-100 flex items-center justify-center overflow-hidden group"
                        title={item.content_type === 'video' || item.content_type === 'audio' ? 'Play' : 'Open'}
                      >
                        {thumbUrls[item.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbUrls[item.id]} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          getTypeIcon(item.content_type)
                        )}
                        {(item.content_type === 'video' || item.content_type === 'audio') && (
                          <span className="absolute inset-0 flex items-center justify-center bg-espresso/20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="grid place-items-center w-14 h-14 rounded-full bg-cream/90 text-espresso shadow-sticker-sm">
                              <Play className="w-6 h-6 ml-0.5" />
                            </span>
                          </span>
                        )}
                      </button>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-espresso truncate">{item.title}</h3>
                          <button className="text-espresso/45 hover:text-espresso/70">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-espresso/70 mb-3 line-clamp-2">{item.description}</p>
                        <div className="flex items-center justify-between text-sm text-espresso/55 mb-3">
                          <span>{item.file_size}</span>
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-3">
                            <span className="flex items-center text-espresso/55">
                              <Download className="w-4 h-4 mr-1" />
                              {item.is_downloadable ? (item as any).downloads || 0 : 'N/A'}
                            </span>
                            <span className="flex items-center text-espresso/55">
                              <Eye className="w-4 h-4 mr-1" />
                              {(item as any).views || 0}
                            </span>
                          </div>
                          <div className="flex space-x-1">
                            <button onClick={() => openPlayer(item)} title="Play / open" className="p-1 text-espresso/45 hover:text-terracotta">
                              <Play className="w-4 h-4" />
                            </button>
                            {item.is_downloadable && (
                              <button onClick={() => downloadItem(item)} title="Download" className="p-1 text-espresso/45 hover:text-forest">
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => openEdit(item)} title="Edit" className="p-1 text-espresso/45 hover:text-forest">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteItem(item)} disabled={deletingId === item.id} title="Delete" className="p-1 text-espresso/45 hover:text-coral disabled:opacity-40">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid border border-espresso/15 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-espresso/15">
                      <thead className="bg-cream-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                            Subject
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                            Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                            Stats
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
                        {filteredContent.map((item) => (
                          <tr key={item.id} className="hover:bg-cream-100">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => openPlayer(item)}
                                  className="relative shrink-0 w-16 h-10 rounded-md overflow-hidden bg-cream-100 grid place-items-center group"
                                  title="Play / open"
                                >
                                  {thumbUrls[item.id] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumbUrls[item.id]} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="scale-[0.55]">{getTypeIcon(item.content_type)}</span>
                                  )}
                                  {(item.content_type === 'video' || item.content_type === 'audio') && (
                                    <Play className="absolute w-4 h-4 text-cream drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </button>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-espresso">{item.title}</div>
                                  <div className="text-sm text-espresso/55 truncate max-w-xs">{item.description}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="capitalize text-sm text-espresso">{item.content_type}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-espresso">{(item as any).course?.subject?.name || 'N/A'}</span>
                              <div className="text-sm text-espresso/55">{(item as any).course?.level || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                              {item.file_size}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-espresso">{(item as any).downloads || 0} downloads</div>
                              <div className="text-sm text-espresso/55">{(item as any).views || 0} views</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button onClick={() => openPlayer(item)} title="Play / open" className="text-terracotta hover:text-terracotta-700">
                                  <Play className="w-4 h-4" />
                                </button>
                                {item.is_downloadable && (
                                  <button onClick={() => downloadItem(item)} title="Download" className="text-forest hover:text-forest-500">
                                    <Download className="w-4 h-4" />
                                  </button>
                                )}
                                <button onClick={() => openEdit(item)} title="Edit" className="text-forest hover:text-forest-500">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteItem(item)} disabled={deletingId === item.id} title="Delete" className="text-coral hover:text-coral-400 disabled:opacity-40">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <Upload className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-espresso mb-2">No content found</h3>
                <p className="text-espresso/55 mb-4">Get started by uploading your first teaching material</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center px-4 py-2 text-white bg-terracotta rounded-lg hover:bg-terracotta-500"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Content
                </button>
              </div>
            )}
          </motion.div>
        </main>
      </div>

      {}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Upload Content</h3>
            
            {!selectedCourse && (
              <div className="mb-4 p-3 bg-mustard/15 border border-mustard/40 rounded-lg">
                <p className="text-mustard-500 text-sm">Please select a course/folder first before uploading content.</p>
              </div>
            )}

            {uploadError && (
              <div className="mb-4 p-3 bg-coral/10 border border-coral/30 rounded-lg">
                <p className="text-coral text-sm">{uploadError}</p>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  placeholder="Enter content title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Description
                </label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  placeholder="Enter content description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Content Type *
                </label>
                <select
                  required
                  value={uploadForm.content_type}
                  onChange={(e) => setUploadForm({ ...uploadForm, content_type: e.target.value })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="document">Document</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="image">Image</option>
                  <option value="presentation">Presentation</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Access Level *
                </label>
                <select
                  required
                  value={uploadForm.access_level}
                  onChange={(e) => setUploadForm({ ...uploadForm, access_level: e.target.value })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                >
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                  <option value="members_only">Members Only</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_downloadable"
                  checked={uploadForm.is_downloadable}
                  onChange={(e) => setUploadForm({ ...uploadForm, is_downloadable: e.target.checked })}
                  className="w-4 h-4 text-terracotta border-espresso/20 rounded focus:ring-terracotta"
                />
                <label htmlFor="is_downloadable" className="ml-2 text-sm text-espresso">
                  Allow students to download this content
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  File *
                </label>
                <input
                  type="file"
                  required
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                />
                {uploadForm.file && (
                  <p className="mt-2 text-sm text-espresso/70">
                    Selected: {uploadForm.file.name} ({(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Thumbnail / preview image <span className="text-espresso/45">(optional)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadForm({ ...uploadForm, thumbnail: e.target.files?.[0] || null })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                />
                {uploadForm.thumbnail && (
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(uploadForm.thumbnail)}
                      alt="thumbnail preview"
                      className="w-24 h-14 object-cover rounded-md border border-espresso/15"
                    />
                    <span className="text-sm text-espresso/70">{uploadForm.thumbnail.name}</span>
                  </div>
                )}
              </div>

              {uploadLoading && (
                <div className="pt-2">
                  <UploadProgress value={uploadProgress} speed={uploadSpeed} label="Uploading content" />
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadError('');
                    setUploadForm({
                      title: '',
                      description: '',
                      content_type: 'document',
                      access_level: 'free',
                      is_downloadable: true,
                      file: null,
                      thumbnail: null,
                    });
                  }}
                  className="px-4 py-2 text-espresso bg-cream-300 rounded-lg hover:bg-cream-300"
                  disabled={uploadLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-cream bg-terracotta border-2 border-espresso rounded-full shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform disabled:bg-cream-200 disabled:text-espresso/40 disabled:border-espresso/15 disabled:shadow-none disabled:hover:translate-y-0 disabled:cursor-not-allowed flex items-center font-semibold"
                  disabled={uploadLoading || !selectedCourse}
                >
                  {uploadLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {}
      {showCreateFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Create New Folder (Course)</h3>
            
            {createFolderError && (
              <div className="mb-4 p-3 bg-coral/10 border border-coral/30 rounded-lg">
                <p className="text-coral text-sm">{createFolderError}</p>
              </div>
            )}

            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Folder Name *
                </label>
                <input
                  type="text"
                  required
                  value={folderForm.title}
                  onChange={(e) => setFolderForm({ ...folderForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  placeholder="e.g., Mathematics Grade 10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Description
                </label>
                <textarea
                  value={folderForm.description}
                  onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  placeholder="Describe what this folder will contain"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Level *
                  </label>
                  <select
                    required
                    value={folderForm.level}
                    onChange={(e) => setFolderForm({ ...folderForm, level: e.target.value })}
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-espresso mb-2">
                    Status *
                  </label>
                  <select
                    required
                    value={folderForm.status}
                    onChange={(e) => setFolderForm({ ...folderForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-espresso mb-2">
                  Price (LKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={folderForm.price}
                  onChange={(e) => setFolderForm({ ...folderForm, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  placeholder="0.00"
                />
                <p className="mt-1 text-sm text-espresso/55">Leave as 0 for free content</p>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateFolderModal(false);
                    setCreateFolderError('');
                    setFolderForm({
                      title: '',
                      description: '',
                      level: 'beginner',
                      status: 'draft',
                      price: 0
                    });
                  }}
                  className="px-4 py-2 text-espresso bg-cream-300 rounded-lg hover:bg-cream-300"
                  disabled={createFolderLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-cream bg-terracotta border-2 border-espresso rounded-full shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform disabled:bg-cream-200 disabled:text-espresso/40 disabled:border-espresso/15 disabled:shadow-none disabled:hover:translate-y-0 disabled:cursor-not-allowed flex items-center font-semibold"
                  disabled={createFolderLoading}
                >
                  {createFolderLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Create Folder
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Video / audio player modal */}
      {playing && (
        <div
          className="fixed inset-0 z-50 bg-espresso/70 flex items-center justify-center p-4"
          onClick={() => { setPlaying(null); setPlayingSrc(''); }}
        >
          <div
            className="bg-cream-50 rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-espresso/10">
              <h2 className="font-semibold text-espresso truncate">{playing.title}</h2>
              <div className="flex items-center gap-2 shrink-0">
                {playing.is_downloadable && (
                  <button
                    onClick={() => downloadItem(playing)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-forest text-cream border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 transition-transform"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                )}
                <button
                  onClick={() => { setPlaying(null); setPlayingSrc(''); }}
                  className="p-2 text-espresso/55 hover:text-espresso"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4">
              {playerLoading || !playingSrc ? (
                <div className="aspect-video grid place-items-center bg-espresso/5 rounded-xl text-espresso/50 text-sm">
                  Loading…
                </div>
              ) : (
                <VideoPlayer
                  src={playingSrc}
                  title={playing.title}
                  poster={thumbUrls[playing.id]}
                  initialAudioOnly={playing.content_type === 'audio'}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit content modal */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 bg-espresso/70 flex items-center justify-center p-4"
          onClick={() => !editSaving && setEditingItem(null)}
        >
          <div className="bg-cream-50 rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-espresso/10">
              <h2 className="font-semibold text-espresso">Edit content</h2>
              <button onClick={() => setEditingItem(null)} className="p-2 text-espresso/55 hover:text-espresso" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-espresso mb-1">Title *</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-espresso mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-espresso mb-1">Access level</label>
                <select
                  value={editForm.access_level}
                  onChange={(e) => setEditForm({ ...editForm, access_level: e.target.value })}
                  className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso outline-none transition"
                >
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-espresso">
                <input
                  type="checkbox"
                  checked={editForm.is_downloadable}
                  onChange={(e) => setEditForm({ ...editForm, is_downloadable: e.target.checked })}
                />
                Allow students to download this content
              </label>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-espresso/10">
              <button
                onClick={() => setEditingItem(null)}
                disabled={editSaving}
                className="px-4 py-2 bg-cream-300 text-espresso rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editForm.title.trim()}
                className="px-4 py-2 bg-terracotta text-cream rounded-lg disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherContentPage;