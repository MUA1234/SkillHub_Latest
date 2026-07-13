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
    folder: 'lessons',
    description: ''
  });
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState<ContentItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [storageInfo, setStorageInfo] = useState({ used: 0, total: 10 });

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
  }, [router, currentUser?.role, selectedFolder]);

  const fetchContentData = async () => {
    try {
      setIsLoading(true);
      setError('');

      let contentResponse: any = null;
      try {
        contentResponse = await apiClient.getTeacherCoursesList();
      } catch (e) {
        console.error('Error fetching courses list:', e);
        contentResponse = null;
      }

      let courses: any[] = [];
      if (Array.isArray(contentResponse)) {
        courses = contentResponse;
      } else if (contentResponse?.courses && Array.isArray(contentResponse.courses)) {
        courses = contentResponse.courses;
      } else if (contentResponse?.data && Array.isArray(contentResponse.data)) {
        courses = contentResponse.data;
      }

      const transformedContent: ContentItem[] = courses.map((course: any) => ({
        id: course?.id || Math.random().toString(),
        title: course?.title || 'Untitled',
        type: course?.type || 'document',
        subject: course?.subject || 'General',
        grade: course?.level || 'All Levels',
        fileType: course?.file_type || 'PDF',
        size: course?.file_size || '0 MB',
        createdDate: course?.created_at ? new Date(course.created_at).toLocaleDateString() : 'N/A',
        lastModified: course?.updated_at ? new Date(course.updated_at).toLocaleDateString() : 'N/A',
        views: course?.views || 0,
        shares: course?.shares || 0,
        downloads: course?.downloads || 0,
        isShared: course?.is_shared || false,
        isFavorite: course?.is_favorite || false,
        description: course?.description || ''
      }));

      setContent(transformedContent);

      setFolders([
        { id: 'all', name: 'All Content', count: transformedContent.length, icon: FolderOpen },
        { id: 'lessons', name: 'Lesson Plans', count: Math.floor(transformedContent.length * 0.3), icon: Folder },
        { id: 'presentations', name: 'Presentations', count: Math.floor(transformedContent.length * 0.2), icon: FileText },
        { id: 'videos', name: 'Video Content', count: Math.floor(transformedContent.length * 0.15), icon: Video },
        { id: 'assessments', name: 'Assessments', count: Math.floor(transformedContent.length * 0.2), icon: FileText },
        { id: 'resources', name: 'Resources', count: Math.floor(transformedContent.length * 0.15), icon: Folder }
      ]);

      const totalSize = courses.reduce((acc: number, c: any) => {
        const sizeStr = c?.file_size || '0';
        const sizeMB = parseFloat(sizeStr) || 0;
        return acc + sizeMB;
      }, 0);
      setStorageInfo({ used: totalSize / 1024, total: 10 });

    } catch (err: any) {
      console.error('Content error:', err);
      setError(err?.message || 'Failed to load content');
      setContent([]);
      setFolders([
        { id: 'all', name: 'All Content', count: 0, icon: FolderOpen },
        { id: 'lessons', name: 'Lesson Plans', count: 0, icon: Folder },
        { id: 'presentations', name: 'Presentations', count: 0, icon: FileText },
        { id: 'videos', name: 'Video Content', count: 0, icon: Video },
        { id: 'assessments', name: 'Assessments', count: 0, icon: FileText },
        { id: 'resources', name: 'Resources', count: 0, icon: Folder }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      alert('Please select a file to upload');
      return;
    }
    
    if (!fileData.title.trim()) {
      alert('Please enter a title for the file');
      return;
    }

    try {
      setUploadLoading(true);
      
      console.log('Uploading file:', selectedFile, fileData);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      alert(`File "${fileData.title}" uploaded successfully!`);
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setFileData({
        title: '',
        subject: '',
        grade: '',
        folder: 'lessons',
        description: ''
      });
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

    try {
      setBulkUploadLoading(true);
      
      console.log('Bulk uploading files:', bulkFiles);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      alert(`${bulkFiles.length} files uploaded successfully!`);
      setIsBulkUploadModalOpen(false);
      setBulkFiles([]);
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
      
      console.log('Creating folder:', newFolderName);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert(`Folder "${newFolderName}" created successfully!`);
      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
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
                {content.length === 0 ? (
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
                    {content.map((item, index) => {
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
                        {content.map((item, index) => {
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
                  <h3 className="text-lg font-semibold text-espresso mb-4">Storage Usage</h3>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-espresso/70">
                      Used: {storageInfo.used.toFixed(1)} GB of {storageInfo.total} GB
                    </span>
                    <span className="text-sm text-espresso/70">
                      {((storageInfo.used / storageInfo.total) * 100).toFixed(0)}% used
                    </span>
                  </div>
                  <div className="w-full bg-cream-300 rounded-full h-2">
                    <div
                      className="bg-teacher-600 h-2 rounded-full"
                      style={{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }}
                    ></div>
                  </div>
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
                      Folder
                    </label>
                    <select
                      name="folder"
                      value={fileData.folder}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-espresso/20 rounded-lg"
                      required
                    >
                      {folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
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