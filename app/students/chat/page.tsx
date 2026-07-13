'use client';

import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { getCurrentUser, isAuthenticated, apiClient } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtimeMessages, RealtimeMessageRow } from '@/hooks/use-realtime-messages';
import { DictateButton } from '@/components/accessibility/DictateButton';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { ReportDialog } from '@/components/moderation/ReportDialog';
import { 
  Search, 
  Send, 
  Phone, 
  Video, 
  MoreVertical, 
  Paperclip, 
  Smile,
  Star,
  User,
  MessageSquare,
  Circle,
  Clock,
  FileText,
  Image as ImageIcon,
  Archive,
  AlertTriangle,
  Filter,
  X
} from 'lucide-react';

interface Teacher {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject: string;
  avatar: string;
  is_online: boolean;
  last_seen: string;
  rating: number;
  response_time: string;
  unread_count: number;
  last_message: string;
  last_message_time: string;
  last_message_from_me: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  attachments: string[];
  is_read: boolean;
  created_at: string;
  is_from_me: boolean;
  timestamp: string;
}

interface UserData {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

const StudentChatPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const incomingConversationId = searchParams?.get('conversation') || null;
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [showVideoCallModal, setShowVideoCallModal] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const videoCallRef = useFocusTrap<HTMLDivElement>(
    showVideoCallModal,
    () => setShowVideoCallModal(false),
  );
  const attachRef = useFocusTrap<HTMLDivElement>(
    showAttachModal,
    () => setShowAttachModal(false),
  );

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/');
      return;
    }

    if (currentUser?.role !== 'student') {
      router.push('/');
      return;
    }

    if (currentUser?.profile) {
      setUser({
        first_name: currentUser.profile.first_name || '',
        last_name: currentUser.profile.last_name || '',
        email: currentUser.email || '',
        role: currentUser.role || 'student'
      });
    }

    loadConversations();
  }, [router, currentUser?.role]);

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.getConversations();
      if (response.success) {
        const conversationsData = Array.isArray(response.data) ? response.data : [];
        setTeachers(conversationsData);
      } else {
        setTeachers([]);
        setError('Failed to load conversations');
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
      setTeachers([]);
      setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (teacherData: Teacher) => {
    try {
      setIsLoadingMessages(true);
      setError(null);

      const response = await apiClient.getConversationMessages(teacherData.id);
      if (response.success) {
        const messagesData = Array.isArray(response.data?.messages) ? response.data.messages : [];
        setMessages(messagesData);
      } else {
        setMessages([]);
        setError('Failed to load messages');
      }
    } catch (err) {
      console.error('Error loading messages:', err);
      setMessages([]);
      setError('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTeacherSelect = async (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    await loadMessages(teacher);
  };

  useEffect(() => {
    if (!incomingConversationId || selectedTeacher || teachers.length === 0) {
      return;
    }
    const match = teachers.find((t) => t.id === incomingConversationId);
    if (match) {
      handleTeacherSelect(match);
    }
  }, [incomingConversationId, teachers, selectedTeacher]);

  const onRealtimeMessage = useCallback(
    (row: RealtimeMessageRow) => {
      const myId = (currentUser?.id as string | undefined) || '';
      if (myId && row.sender_id === myId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        const incoming: Message = {
          id: row.id,
          conversation_id: row.conversation_id,
          sender_id: row.sender_id,
          sender_name: selectedTeacher?.teacher_name || 'Teacher',
          sender_role: 'teacher',
          content: row.content,
          attachments: row.attachments || [],
          is_read: false,
          created_at: row.created_at,
          is_from_me: false,
          timestamp: new Date(row.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        return [...prev, incoming];
      });
      setTeachers((prev) =>
        prev.map((t) =>
          t.id === row.conversation_id
            ? {
                ...t,
                last_message: row.content,
                last_message_time: row.created_at,
                last_message_from_me: false,
                unread_count:
                  selectedTeacher?.id === row.conversation_id
                    ? t.unread_count
                    : (t.unread_count || 0) + 1,
              }
            : t,
        ),
      );
    },
    [currentUser?.id, selectedTeacher],
  );

  useRealtimeMessages(selectedTeacher?.id, onRealtimeMessage);

  const filteredTeachers = (Array.isArray(teachers) ? teachers : []).filter(teacher =>
    teacher?.teacher_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    teacher?.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = async () => {
    if (newMessage.trim() && selectedTeacher) {
      try {
        setIsLoadingAction(true);
        
        const response = await apiClient.sendMessage(selectedTeacher.id, newMessage.trim());
        if (response.success) {
          const newMsg: Message = {
            id: response.data.id,
            conversation_id: response.data.conversation_id,
            sender_id: response.data.sender_id,
            sender_name: user?.first_name + ' ' + user?.last_name || 'You',
            sender_role: 'student',
            content: response.data.content,
            attachments: [],
            is_read: true,
            created_at: response.data.created_at,
            is_from_me: true,
            timestamp: response.data.timestamp
          };
          
          setMessages(prev => [...prev, newMsg]);
          setNewMessage('');
          
          setTeachers(prev => prev.map(t => 
            t.id === selectedTeacher.id 
              ? { 
                  ...t, 
                  last_message: newMessage.trim(),
                  last_message_time: response.data.created_at,
                  last_message_from_me: true
                }
              : t
          ));
        } else {
          setError('Failed to send message');
        }
      } catch (err) {
        console.error('Error sending message:', err);
        setError('Failed to send message');
      } finally {
        setIsLoadingAction(false);
      }
    }
  };

  const handleVideoCall = () => {
    setShowVideoCallModal(true);
  };

  const handleVoiceCall = () => {
    alert('Voice call feature coming soon!');
  };

  const handleMoreMenu = () => {
    setShowMoreMenu(!showMoreMenu);
  };

  const handleAttachFile = () => {
    setShowAttachModal(true);
  };

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear this chat? This action cannot be undone.')) {
      setMessages([]);
      setShowMoreMenu(false);
    }
  };

  const handleViewProfile = () => {
    if (selectedTeacher) {
      router.push(`/students/find-teachers?teacher=${selectedTeacher.teacher_id}`);
    }
    setShowMoreMenu(false);
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
        
        <main className="flex-1 transition-all duration-300 h-[calc(100vh-4rem)]">
          <div className="flex h-full">
            {}
            <div className="w-80 bg-cream-50 border-r border-espresso/15 flex flex-col">
              {}
              <div className="p-4 border-b border-espresso/15">
                <h1 className="text-xl font-bold text-espresso mb-4">Messages</h1>
                
                {}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-espresso/45 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search teachers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  />
                </div>
              </div>

              {}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center space-x-3 animate-pulse">
                        <div className="w-12 h-12 bg-cream-300 rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-cream-300 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-cream-300 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-4 text-center">
                    <p className="text-red-500 text-sm">{error}</p>
                    <button 
                      onClick={loadConversations}
                      className="mt-2 text-terracotta text-sm hover:underline font-semibold"
                    >
                      Try Again
                    </button>
                  </div>
                ) : filteredTeachers.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-espresso/55 text-sm">No conversations found</p>
                  </div>
                ) : (
                  filteredTeachers.map((teacher) => (
                    <motion.div
                      key={teacher.id}
                      whileHover={{ backgroundColor: '#f9fafb' }}
                      onClick={() => handleTeacherSelect(teacher)}
                      className={`p-4 border-b border-espresso/10 cursor-pointer ${
                        selectedTeacher?.id === teacher.id ? 'bg-terracotta/10 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <img
                            src={teacher.avatar}
                            alt={teacher.teacher_name}
                            className="w-12 h-12 rounded-full"
                          />
                          {teacher.is_online && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-espresso truncate">{teacher.teacher_name}</h3>
                            {teacher.unread_count > 0 && (
                              <span className="bg-terracotta text-cream border border-espresso text-xs rounded-full px-2 py-1 min-w-[20px] text-center font-bold">
                                {teacher.unread_count}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-espresso/55 truncate">{teacher.subject}</p>
                          <div className="flex items-center space-x-1 mt-1">
                            <Star className="w-3 h-3 text-yellow-500 fill-current" />
                            <span className="text-xs text-espresso/55">{teacher.rating}</span>
                            <span className="text-xs text-espresso/45">•</span>
                            <span className="text-xs text-espresso/55">{teacher.response_time}</span>
                          </div>
                          <p className="text-xs text-espresso/45 mt-1">{teacher.last_seen}</p>
                          {teacher.last_message && (
                            <p className="text-xs text-espresso/70 mt-1 truncate">
                              {teacher.last_message_from_me ? 'You: ' : ''}{teacher.last_message}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            {}
            <div className="flex-1 flex flex-col">
              {selectedTeacher ? (
                <>
                  {}
                  <div className="bg-cream-50 border-b border-espresso/15 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <img
                            src={selectedTeacher.avatar}
                            alt={selectedTeacher.teacher_name}
                            className="w-10 h-10 rounded-full"
                          />
                          {selectedTeacher.is_online && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                          )}
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-espresso">{selectedTeacher.teacher_name}</h2>
                          <p className="text-sm text-espresso/55">{selectedTeacher.subject} • {selectedTeacher.last_seen}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 relative">
                        <button 
                          onClick={handleVoiceCall}
                          className="p-2 text-espresso/45 hover:text-espresso/70 hover:bg-cream-100 rounded-lg"
                          title="Voice Call"
                        >
                          <Phone className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={handleVideoCall}
                          className="p-2 text-espresso/45 hover:text-espresso/70 hover:bg-cream-100 rounded-lg"
                          title="Video Call"
                        >
                          <Video className="w-5 h-5" />
                        </button>
                        <div className="relative">
                          <button 
                            onClick={handleMoreMenu}
                            className="p-2 text-espresso/45 hover:text-espresso/70 hover:bg-cream-100 rounded-lg"
                            title="More Options"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          
                          {}
                          {showMoreMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-cream-50 border border-espresso/15 rounded-2xl shadow-kid-lg z-10">
                              <button
                                onClick={handleViewProfile}
                                className="w-full px-4 py-2 text-left text-sm text-espresso hover:bg-cream-100 flex items-center space-x-2"
                              >
                                <User className="w-4 h-4" />
                                <span>View Profile</span>
                              </button>
                              <button
                                onClick={handleClearChat}
                                className="w-full px-4 py-2 text-left text-sm text-coral hover:bg-coral/10 flex items-center space-x-2"
                              >
                                <Archive className="w-4 h-4" />
                                <span>Clear Chat</span>
                              </button>
                              <button
                                onClick={() => { setShowMoreMenu(false); setReportOpen(true); }}
                                className="w-full px-4 py-2 text-left text-sm text-coral hover:bg-coral/10 flex items-center space-x-2 border-t border-espresso/10"
                              >
                                <AlertTriangle className="w-4 h-4" />
                                <span>Report this user</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-cream-100">
                    {isLoadingMessages ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                            <div className="max-w-xs lg:max-w-md">
                              <div className="animate-pulse bg-cream-300 rounded-lg h-12 w-48"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-center">
                        <div>
                          <MessageSquare className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-espresso mb-2">No messages yet</h3>
                          <p className="text-espresso/55">Start the conversation by sending a message!</p>
                        </div>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {messages.map((message) => (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={`flex ${message.is_from_me ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              message.is_from_me
                                ? 'bg-terracotta text-white'
                                : 'bg-cream-50 text-espresso border border-espresso/15'
                            }`}>
                              <p className="text-sm">{message.content}</p>
                              <p className={`text-xs mt-1 ${
                                message.is_from_me ? 'text-cream/70' : 'text-espresso/55'
                              }`}>
                                {message.timestamp}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {}
                  <div className="bg-cream-50 border-t border-espresso/15 p-4">
                    {error && (
                      <div className="mb-3 p-2 bg-coral/10 border border-coral/30 rounded text-coral text-sm">
                        {error}
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={handleAttachFile}
                        className="p-2 text-espresso/45 hover:text-espresso/70 hover:bg-cream-100 rounded-lg"
                        title="Attach File"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <div className="flex-1 relative max-w-md">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !isLoadingAction && handleSendMessage()}
                          placeholder="Type a message..."
                          disabled={isLoadingAction}
                          className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition disabled:bg-cream-100"
                        />
                      </div>
                      <DictateButton value={newMessage} onChange={setNewMessage} compact />
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="p-2 text-espresso/45 hover:text-espresso/70 hover:bg-cream-100 rounded-lg"
                        title="Add Emoji"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || isLoadingAction}
                        className="p-2 bg-terracotta text-white rounded-lg hover:bg-terracotta-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Send Message"
                      >
                        {isLoadingAction ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-cream-100">
                  <div className="text-center">
                    <MessageSquare className="w-16 h-16 text-espresso/45 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-espresso mb-2">Select a Teacher to Start Chatting</h3>
                    <p className="text-espresso/55">Choose a teacher from the sidebar to begin your conversation.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {}
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={selectedTeacher?.teacher_id}
        subjectLabel={selectedTeacher?.teacher_name}
      />

      {}
      {showVideoCallModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            ref={videoCallRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-call-title"
            className="bg-cream-50 rounded-lg p-6 max-w-md w-full mx-4"
          >
            <div className="text-center">
              <Video className="w-16 h-16 text-terracotta mx-auto mb-4" />
              <h3 id="video-call-title" className="text-lg font-semibold text-espresso mb-2">Video Call Feature</h3>
              <p className="text-espresso/70 mb-6">
                Video calling functionality is coming soon! We're working hard to bring you high-quality video communication with your teachers.
              </p>
              <button
                onClick={() => setShowVideoCallModal(false)}
                className="w-full bg-terracotta text-white py-2 px-4 rounded-lg hover:bg-terracotta-500"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {showAttachModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            ref={attachRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attach-file-title"
            className="bg-cream-50 rounded-lg p-6 max-w-md w-full mx-4"
          >
            <div className="text-center">
              <Paperclip className="w-16 h-16 text-espresso/55 mx-auto mb-4" />
              <h3 id="attach-file-title" className="text-lg font-semibold text-espresso mb-2">File Attachment</h3>
              <p className="text-espresso/70 mb-6">
                File attachment feature is coming soon! You'll be able to share documents, images, and other files with your teachers.
              </p>
              <button
                onClick={() => setShowAttachModal(false)}
                className="w-full bg-espresso/85 text-white py-2 px-4 rounded-lg hover:bg-espresso"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {(showMoreMenu || showEmojiPicker) && (
        <div 
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowMoreMenu(false);
            setShowEmojiPicker(false);
          }}
        />
      )}
    </div>
  );
};

export default function StudentChatPageWithSuspense() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-espresso/55">Loading chat…</div>}>
      <StudentChatPage />
    </Suspense>
  );
}