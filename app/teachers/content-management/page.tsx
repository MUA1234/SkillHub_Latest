'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import {
  FileText,
  Upload,
  Download,
  Eye,
  Edit,
  Trash2,
  Share,
  Folder,
  FolderOpen,
  Search,
  Grid,
  List,
  Star,
  Video,
  File,
  Plus,
  MoreVertical,
  X,
  Check,
  Loader,
  AlertCircle
} from 'lucide-react';

interface ContentItem {
  id: string;
  courseId: string;
  title: string;
  type: string;
  subject: string;
  grade: string;
  fileType: string;
  size: string;
  createdDate: string;
  lastModified: string;
  views: number;
  shares: number;
  downloads: number;
  isShared: boolean;
  isFavorite: boolean;
  description: string;
}

interface FolderItem {
  id: string;
  name: string;
  count: number;
  icon: any;
}

// course_content.file_size is a free-text field like "2.4 GB" / "450 KB" —
// same format the real upload flow (app/teachers/content/upload) writes.
const parseSizeToMB = (sizeStr?: string): number => {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(KB|MB|GB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'GB') return value * 1024;
  if (unit === 'KB') return value / 1024;
  return value;
};

const inferContentType = (file: File): string => {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.includes('presentation') || /\.(ppt|pptx)$/i.test(file.name)) return 'presentation';
  return 'document';
};

const ContentManagementPage = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState({
    title: '',
    subject: '',
    grade: '',
    folder: '',
    description: ''
  });
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploadCourseId, setBulkUploadCourseId] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState<ContentItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [storageUsedGB, setStorageUsedGB] = useState(0);

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

    fetchContentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, currentUser?.role]);

  const fetchContentData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const coursesResponse = await apiClient.getTeacherCourses();
      const realCourses: any[] = Array.isArray(coursesResponse?.courses) ? coursesResponse.courses : [];
      setCourses(realCourses);

      // "Folders" map onto courses — course_content has no separate category
      // column, and a course is the real grouping unit content already lives
      // under (see GET /teachers/content?course_id=...).
      const perCourse = await Promise.all(
        realCourses.map((course: any) =>
          apiClient
            .getTeacherContent(course.id, { limit: 100 })
            .then((r) => ({ course, items: r.content || [] }))
            .catch(() => ({ course, items: [] as any[] }))
        )
      );

      const transformedContent: ContentItem[] = perCourse.flatMap(({ course, items }) =>
        items.map((item: any) => ({
          id: item.id,
          courseId: course.id,
          title: item.title || 'Untitled',
          type: item.content_type || 'document',
          subject: course.title || 'General',
          grade: course.level || 'All Levels',
          fileType: (item.content_type || 'file').toUpperCase(),
          size: item.file_size || 'N/A',
          createdDate: item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A',
          lastModified: item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A',
          views: 0,
          shares: 0,
          downloads: 0,
          isShared: false,
          isFavorite: false,
          description: item.description || ''
        }))
      );

      setContent(transformedContent);

      setFolders([
        { id: 'all', name: 'All Content', count: transformedContent.length, icon: FolderOpen },
        ...realCourses.map((course: any) => ({
          id: course.id,
          name: course.title || 'Untitled course',
          count: transformedContent.filter((c) => c.courseId === course.id).length,
          icon: Folder,
        })),
      ]);

      const totalMB = perCourse
        .flatMap(({ items }) => items)
        .reduce((acc: number, item: any) => acc + parseSizeToMB(item.file_size), 0);
      setStorageUsedGB(totalMB / 1024);

    } catch (err: any) {
      console.error('Content error:', err);
      setError(err?.message || 'Failed to load content');
      setContent([]);
      setCourses([]);
      setFolders([{ id: 'all', name: 'All Content', count: 0, icon: FolderOpen }]);
    } finally {
      setIsLoading(false);
    }
  };

  const visibleContent = React.useMemo(() => {
    let list = selectedFolder === 'all' ? content : content.filter((c) => c.courseId === selectedFolder);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    }
    return list;
  }, [content, selectedFolder, searchQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFileData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBulkFiles(Array.from(e.target.files));
    }
  };

  const [uploadLoading, setUploadLoading] = useState(false);
  const [bulkUploadLoading, setBulkUploadLoading] = useState(false);
  const [createFolderLoading, setCreateFolderLoading] = useState(false);

  const uploadOneFile = async (file: File, courseId: string, title: string, description: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_id', courseId);
    formData.append('title', title);
    formData.append('description', description || '');
    formData.append('content_type', inferContentType(file));
    formData.append('access_level', 'free');
    formData.append('is_downloadable', 'true');

    const token = localStorage.getItem('access_token');
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/teachers/content/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Upload failed for "${file.name}"`);
    }
    return response.json();
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      alert('Please select a file to upload');
      return;
    }

    if (!fileData.folder) {
      alert('Please choose a course to upload into');
      return;
    }

    if (!fileData.title.trim()) {
      alert('Please enter a title for the file');
      return;
    }

    try {
      setUploadLoading(true);

      await uploadOneFile(selectedFile, fileData.folder, fileData.title, fileData.description);

      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setFileData({
        title: '',
        subject: '',
        grade: '',
        folder: '',
        description: ''
      });
      await fetchContentData();
    } catch (err: any) {
      console.error('Error uploading file:', err);
      alert(`Failed to upload file: ${err.message || 'Unknown error'}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleBulkUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (bulkFiles.length === 0) {
      alert('Please select files to upload');
      return;
    }

    if (!bulkUploadCourseId) {
      alert('Please choose a course to upload into');
      return;
    }

    try {
      setBulkUploadLoading(true);

      const results = await Promise.allSettled(
        bulkFiles.map((file) =>
          uploadOneFile(file, bulkUploadCourseId, file.name.replace(/\.[^/.]+$/, ''), '')
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;

      setIsBulkUploadModalOpen(false);
      setBulkFiles([]);
      setBulkUploadCourseId('');
      await fetchContentData();

      if (failed > 0) {
        alert(`${bulkFiles.length - failed} of ${bulkFiles.length} files uploaded. ${failed} failed.`);
      }
    } catch (err: any) {
      console.error('Error bulk uploading files:', err);
      alert(`Failed to upload files: ${err.message || 'Unknown error'}`);
    } finally {
      setBulkUploadLoading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newFolderName.trim()) {
      alert('Please enter a folder name');
      return;
    }

    try {
      setCreateFolderLoading(true);

      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/teachers/courses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newFolderName,
          description: '',
          level: 'beginner',
          status: 'draft',
          price: 0,
          is_featured: false,
          max_students: 100,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create folder');
      }

      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
      await fetchContentData();
    } catch (err: any) {
      console.error('Error creating folder:', err);
      alert(`Failed to create folder: ${err.message || 'Unknown error'}`);
    } finally {
      setCreateFolderLoading(false);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'video':
        return Video;
      case 'presentation':
        return FileText;
      default:
        return FileText;
    }
  };

  const getFileTypeColor = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return 'bg-coral/15 text-coral';
      case 'pptx':
      case 'ppt':
        return 'bg-orange-100 text-terracotta';
      case 'mp4':
      case 'avi':
        return 'bg-coral/15 text-coral';
      default:
        return 'bg-cream-100 text-espresso/70';
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
                <p className="text-espresso/70">Loading content...</p>
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
                onClick={fetchContentData}
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-bold text-espresso mb-2">
                  Content Management
                </h1>
                <p className="text-espresso/70">
                  Organize and manage your educational materials and resources.
                </p>
              </div>
              <button 
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 transition-colors"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Content
              </button>
            </div>

            <div className="grid lg:grid-cols-4 gap-8">
              {}
              <div className="lg:col-span-1">
                <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid">
                  <h2 className="text-lg font-semibold text-espresso mb-4">Folders</h2>
                  <div className="space-y-2">
                    {folders.map(folder => {
                      const Icon = folder.icon;
                      return (
                        <button
                          key={folder.id}
                          onClick={() => setSelectedFolder(folder.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                            selectedFolder === folder.id 
                              ? 'bg-teacher-50 text-teacher-600' 
                              : 'hover:bg-cream-100'
                          }`}
                        >
                          <div className="flex items-center">
                            <Icon className="w-5 h-5 mr-3" />
                            <span className="text-espresso">{folder.name}</span>
                          </div>
                          <span className="text-sm text-espresso/55">{folder.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {}
                  <div className="mt-8">
                    <h3 className="font-medium text-espresso mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                      <button 
                        onClick={() => setIsCreateFolderModalOpen(true)}
                        className="w-full flex items-center p-3 text-left hover:bg-cream-100 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-3 text-teacher-600" />
                        <span className="text-espresso">Create Folder</span>
                      </button>
                      <button 
                        onClick={() => setIsBulkUploadModalOpen(true)}
                        className="w-full flex items-center p-3 text-left hover:bg-cream-100 rounded-lg transition-colors"
                      >
                        <Upload className="w-4 h-4 mr-3 text-teacher-600" />
                        <span className="text-espresso">Bulk Upload</span>
                      </button>
                      <button 
                        onClick={() => alert('Exporting all content...')}
                        className="w-full flex items-center p-3 text-left hover:bg-cream-100 rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4 mr-3 text-teacher-600" />
                        <span className="text-espresso">Export All</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {}
              <div className="lg:col-span-3">
                {}
                <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mb-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-5 h-5" />
                        <input
                          type="text"
                          placeholder="Search content..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <select className="px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition">
                        <option>All Types</option>
                        <option>Documents</option>
                        <option>Presentations</option>
                        <option>Videos</option>
                      </select>
                      <div className="flex border border-espresso/20 rounded-lg">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-2 ${viewMode === 'grid' ? 'bg-teacher-50 text-teacher-600' : 'text-espresso/70'}`}
                        >
                          <Grid className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-2 ${viewMode === 'list' ? 'bg-teacher-50 text-teacher-600' : 'text-espresso/70'}`}
                        >
                          <List className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {}
                {visibleContent.length === 0 ? (
                  <div className="bg-cream-50 p-12 rounded-lg shadow-sm text-center">
                    <FileText className="w-16 h-16 text-espresso/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-espresso mb-2">No content yet</h3>
                    <p className="text-espresso/55 mb-6">Upload your first file to get started</p>
                    <button
                      onClick={() => setIsUploadModalOpen(true)}
                      className="inline-flex items-center px-4 py-2 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700 transition-colors"
                    >
                      <Upload className="w-5 h-5 mr-2" />
                      Upload Content
                    </button>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleContent.map((item, index) => {
                      const FileIcon = getFileIcon(item.type);
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid overflow-hidden hover:shadow-md transition-shadow"
                        >
                          <div className="h-32 bg-gradient-to-br from-teacher-100 to-teacher-200 flex items-center justify-center">
                            <FileIcon className="w-12 h-12 text-teacher-600" />
                          </div>
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-medium text-espresso text-sm leading-tight">
                                {item.title}
                              </h3>
                              <div className="flex items-center space-x-1">
                                {item.isFavorite && (
                                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                                )}
                                <button className="text-espresso/45 hover:text-espresso/70">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-espresso/55 mb-2">{item.subject} • {item.grade}</p>
                            <div className="flex items-center justify-between mb-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getFileTypeColor(item.fileType)}`}>
                                {item.fileType}
                              </span>
                              <span className="text-xs text-espresso/55">{item.size}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-espresso/55 mb-3">
                              <div className="flex items-center">
                                <Eye className="w-3 h-3 mr-1" />
                                {item.views}
                              </div>
                              <div className="flex items-center">
                                <Download className="w-3 h-3 mr-1" />
                                {item.downloads}
                              </div>
                              <div className="flex items-center">
                                <Share className="w-3 h-3 mr-1" />
                                {item.shares}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => router.push(`/teachers/content/${item.id}`)}
                                className="flex-1 px-3 py-1 bg-teacher-600 text-white rounded text-xs hover:bg-teacher-700 transition-colors"
                              >
                                <Eye className="w-3 h-3 inline mr-1" />
                                View
                              </button>
                              <button 
                                onClick={() => router.push(`/teachers/content/edit/${item.id}`)}
                                className="px-3 py-1 bg-cream-100 text-espresso/70 rounded text-xs hover:bg-cream-300 transition-colors"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => alert(`Sharing ${item.title}...`)}
                                className="px-3 py-1 bg-cream-100 text-espresso/70 rounded text-xs hover:bg-cream-300 transition-colors"
                              >
                                <Share className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid overflow-hidden">
                    <table className="w-full">
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
                            Modified
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-cream-50 divide-y divide-espresso/15">
                        {visibleContent.map((item, index) => {
                          const FileIcon = getFileIcon(item.type);
                          return (
                            <motion.tr
                              key={item.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                              className="hover:bg-cream-100"
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <FileIcon className="w-8 h-8 text-teacher-600 mr-3" />
                                  <div>
                                    <div className="text-sm font-medium text-espresso flex items-center">
                                      {item.title}
                                      {item.isFavorite && (
                                        <Star className="w-4 h-4 text-yellow-500 fill-current ml-2" />
                                      )}
                                    </div>
                                    <div className="text-sm text-espresso/55">{item.size}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getFileTypeColor(item.fileType)}`}>
                                  {item.fileType}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                                {item.subject}
                                <div className="text-xs text-espresso/55">{item.grade}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso/55">
                                {item.lastModified}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button 
                                    onClick={() => router.push(`/teachers/content/${item.id}`)}
                                    className="text-teacher-600 hover:text-teacher-900"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => router.push(`/teachers/content/edit/${item.id}`)}
                                    className="text-espresso/45 hover:text-espresso/70"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => alert(`Sharing ${item.title}...`)}
                                    className="text-espresso/45 hover:text-espresso/70"
                                  >
                                    <Share className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => alert(`Are you sure you want to delete ${item.title}?`)}
                                    className="text-espresso/45 hover:text-coral"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {}
                <div className="bg-cream-50 p-6 rounded-2xl border-2 border-espresso/10 shadow-kid mt-6">
                  <h3 className="text-lg font-semibold text-espresso mb-4">Storage</h3>
                  <span className="text-sm text-espresso/70">
                    {storageUsedGB >= 1
                      ? `${storageUsedGB.toFixed(1)} GB`
                      : `${(storageUsedGB * 1024).toFixed(0)} MB`}{' '}
                    used across {content.length} file{content.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-espresso">Upload Content</h2>
                <button 
                  onClick={() => setIsUploadModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleUploadSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={fileData.title}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Advanced Calculus - Derivatives"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={fileData.subject}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Mathematics"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Grade/Level
                    </label>
                    <input
                      type="text"
                      name="grade"
                      value={fileData.grade}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Grade 12"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Course
                    </label>
                    <select
                      name="folder"
                      value={fileData.folder}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      required
                    >
                      <option value="" disabled>Select a course</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                    {courses.length === 0 && (
                      <p className="text-xs text-espresso/55 mt-1">Create a course first from "Create Folder" below.</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={fileData.description}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      placeholder="Describe your content..."
                      required
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-espresso mb-1">
                      Select File
                    </label>
                    <div className="border-2 border-dashed border-espresso/20 rounded-lg p-8 text-center">
                      <Upload className="w-12 h-12 text-espresso/45 mx-auto mb-3" />
                      <p className="text-espresso/70 mb-4">Drag & drop files here or click to browse</p>
                      <input 
                        type="file" 
                        onChange={handleFileUpload}
                        className="hidden" 
                        id="file-upload"
                        required
                      />
                      <label 
                        htmlFor="file-upload" 
                        className="inline-block bg-teacher-600 text-white px-6 py-2 rounded-lg hover:bg-teacher-700 transition-colors cursor-pointer"
                      >
                        Browse Files
                      </label>
                      {selectedFile && (
                        <div className="mt-4 p-3 bg-cream-100 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <File className="w-5 h-5 text-espresso/55 mr-2" />
                              <span className="text-espresso">{selectedFile.name}</span>
                            </div>
                            <span className="text-xs text-espresso/55">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="px-6 py-3 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700"
                  >
                    Upload Content
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {isCreateFolderModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Create New Folder</h2>
                <button 
                  onClick={() => setIsCreateFolderModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleCreateFolder}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Folder Name
                  </label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    placeholder="Enter folder name"
                    required
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateFolderModalOpen(false)}
                    className="px-6 py-3 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-teacher-600 text-white rounded-lg hover:bg-teacher-700"
                  >
                    Create Folder
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {}
      {isBulkUploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-espresso">Bulk Upload Content</h2>
                <button 
                  onClick={() => setIsBulkUploadModalOpen(false)}
                  className="text-espresso/55 hover:text-espresso"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleBulkUploadSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-espresso mb-1">
                    Course
                  </label>
                  <select
                    value={bulkUploadCourseId}
                    onChange={(e) => setBulkUploadCourseId(e.target.value)}
                    className="w-full p-3 border border-espresso/20 rounded-lg"
                    required
                  >
                    <option value="" disabled>Select a course</option>
                    {courses.map(course => (
                      <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-6">
                  <div className="border-2 border-dashed border-espresso/20 rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 text-espresso/45 mx-auto mb-3" />
                    <p className="text-espresso/70 mb-4">Drag & drop files here or click to browse</p>
                    <input
                      type="file"
                      multiple 
                      onChange={handleBulkUpload}
                      className="hidden" 
                      id="bulk-upload"
                    />
                    <label 
                      htmlFor="bulk-upload" 
                      className="inline-block bg-teacher-600 text-white px-6 py-2 rounded-lg hover:bg-teacher-700 transition-colors cursor-pointer"
                    >
                      Select Files
                    </label>
                  </div>
                  
                  {bulkFiles.length > 0 && (
                    <div className="mt-6">
                      <h3 className="font-medium text-espresso mb-3">Selected Files</h3>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {bulkFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-cream-100 rounded-lg">
                            <div className="flex items-center">
                              <File className="w-5 h-5 text-espresso/55 mr-2" />
                              <span className="text-espresso truncate max-w-xs">{file.name}</span>
                            </div>
                            <span className="text-xs text-espresso/55">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkUploadModalOpen(false)}
                    className="px-6 py-3 bg-cream-100 text-espresso rounded-lg hover:bg-cream-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkFiles.length === 0}
                    className={`px-6 py-3 rounded-lg ${
                      bulkFiles.length === 0 
                        ? 'bg-cream-300 text-espresso/55 cursor-not-allowed' 
                        : 'bg-teacher-600 text-white hover:bg-teacher-700'
                    }`}
                  >
                    Upload All Files
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentManagementPage;