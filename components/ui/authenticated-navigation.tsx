'use client';

import Link from 'next/link';
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { apiClient, getCurrentUser } from '@/lib/api';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { useAdaptiveAccessibility } from '@/contexts/AdaptiveAccessibilityContext';
import {
  useRealtimeNotifications,
  RealtimeNotificationRow,
} from '@/hooks/use-realtime-notifications';
import { useTranslation } from '@/hooks/use-translation';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { PWAInstallButton } from '@/components/PWAInstallButton';
import { Logo } from '@/components/ui/logo';
import { TrackBadge } from '@/components/accessibility/TrackBadge';
import {
  pushSupported,
  subscribeToPush,
  getCurrentPushPermission,
} from '@/lib/push';
import { 
  BookOpen, 
  Menu, 
  X, 
  Search, 
  Bell, 
  User, 
  Settings, 
  LogOut,
  ChevronDown,
  Home,
  Info,
  Phone,
  Users,
  MessageSquare,
  Calendar,
  Trophy,
  UserPlus,
  MapPin,
  FileText,
  Megaphone,
  Network,
  HelpCircle,
  Globe
} from 'lucide-react';

interface DropdownItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

interface NavigationItem {
  name: string;
  icon: React.ComponentType<any>;
  href?: string;
  dropdown?: DropdownItem[];
}

interface AuthenticatedNavigationProps {
  userRole: 'student' | 'teacher' | 'sponsor';
  userName: string;
  userEmail: string;
}

// Most roles pluralize to their route prefix (student -> /students), but
// admin and guardian don't (/admin, /guardian) — this component is only
// rendered for student/teacher/sponsor today, but keeping this defensive
// avoids repeating the pluralization bug wherever it's reused next (see
// app/guardian/dashboard/page.tsx's note about a future GuardianNavigation).
const ROLE_PATH_OVERRIDES: Record<string, string> = { admin: '/admin', guardian: '/guardian' };
const roleRoute = (role: string, path: string) =>
  `${ROLE_PATH_OVERRIDES[role] ?? `/${role}s`}/${path}`;

const AuthenticatedNavigation: React.FC<AuthenticatedNavigationProps> = ({
  userRole,
  userName,
  userEmail
}) => {
  const router = useRouter();
  const { clearUserSettings } = useAccessibility();
  const { clearProfile } = useAdaptiveAccessibility();
  const { t } = useTranslation();
  const currentUser = getCurrentUser();
  const userId = currentUser?.id || null;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationsData, setNotificationsData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [showNotificationDetail, setShowNotificationDetail] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  const roleConfig = {
    student: {
      color: 'terracotta',
      bgColor: 'bg-terracotta',
      hoverColor: 'hover:bg-terracotta-500',
      textColor: 'text-terracotta',
      accentColor: 'border-terracotta',
    },
    teacher: {
      color: 'forest',
      bgColor: 'bg-forest',
      hoverColor: 'hover:bg-forest-400',
      textColor: 'text-forest',
      accentColor: 'border-forest',
    },
    sponsor: {
      color: 'mustard',
      bgColor: 'bg-mustard',
      hoverColor: 'hover:bg-mustard-400',
      textColor: 'text-mustard',
      accentColor: 'border-mustard',
    },
  };

  const config = roleConfig[userRole] || roleConfig.student;

  const isUnread = (n: any): boolean => !(n?.is_read ?? n?.read ?? false);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await apiClient.getNotifications({ limit: 50 });
      const list = response.notifications || [];
      setNotificationsData(list);
      setNotificationCount(
        typeof response.unread_count === 'number'
          ? response.unread_count
          : list.filter(isUnread).length,
      );
    } catch (error) {
      if (userRole === 'teacher') {
        try {
          const legacy = await apiClient.getTeacherNotifications();
          setNotificationsData(legacy.notifications || []);
          setNotificationCount(legacy.unread_count || 0);
          return;
        } catch (legacyErr) {
          console.error('Notifications fallback failed:', legacyErr);
        }
      }
      setNotificationsData([]);
      setNotificationCount(0);
    }
  }, [userRole]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRealtimeNotification = useCallback((row: RealtimeNotificationRow) => {
    setNotificationsData((prev) => {
      if (prev.some((n) => n.id === row.id)) return prev;
      return [row, ...prev].slice(0, 50);
    });
    setNotificationCount((prev) => prev + 1);
  }, []);
  useRealtimeNotifications(userId, onRealtimeNotification);

  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => {
    let cancelled = false;
    getCurrentPushPermission().then((perm) => {
      if (!cancelled) setPushPermission(perm);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const handleEnablePush = async () => {
    const sub = await subscribeToPush();
    setPushPermission(sub ? 'granted' : (await getCurrentPushPermission()));
  };
  const showEnablePush =
    pushSupported() && pushPermission !== 'granted' && pushPermission !== 'denied' && pushPermission !== 'unsupported';

  const handleNotificationClick = async (notification: any) => {
    setSelectedNotification(notification);
    setShowNotificationDetail(true);

    if (isUnread(notification)) {
      try {
        await apiClient.markNotificationReadGeneric(notification.id);
      } catch (error) {
        if (userRole === 'teacher') {
          try {
            await apiClient.markNotificationRead(notification.id);
          } catch (legacyErr) {
            console.error('Error marking notification as read:', legacyErr);
          }
        }
      }
      setNotificationsData((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, is_read: true, read: true } : n,
        ),
      );
      setNotificationCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsReadGeneric();
    } catch (error) {
      if (userRole === 'teacher') {
        try {
          await apiClient.markAllNotificationsRead();
        } catch (legacyErr) {
          console.error('Error marking all notifications as read:', legacyErr);
        }
      }
    }
    setNotificationsData((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read: true })),
    );
    setNotificationCount(0);
  };

  const handleNavigateFromNotification = (notification: any) => {
    if (notification?.link_url) {
      router.push(notification.link_url);
      setShowNotificationDetail(false);
      setActiveDropdown(null);
    }
  };

  const notificationDetailRef = useFocusTrap<HTMLDivElement>(
    showNotificationDetail,
    () => setShowNotificationDetail(false),
  );
  const allNotificationsRef = useFocusTrap<HTMLDivElement>(
    showAllNotifications,
    () => setShowAllNotifications(false),
  );

  const getNavigationItems = (): NavigationItem[] => {
    const commonItems: NavigationItem[] = [];
    if (userRole !== 'student') {
      commonItems.push({ name: 'Home', href: '/', icon: Home });
    }
    commonItems.push({ name: 'Dashboard', href: roleRoute(userRole, 'dashboard'), icon: BookOpen });

    const roleSpecificItems: { [key: string]: NavigationItem[] } = {
      teacher: [
        {
          name: 'Network',
          icon: Network,
          dropdown: [
            { name: 'Advertisements', href: '/teachers/network/advertisements', icon: Megaphone }
          ]
        },
        {
          name: 'Community',
          icon: Users,
          dropdown: [
            { name: 'Forums', href: '/teachers/community/forums', icon: MessageSquare },
            { name: 'Events & Workshops', href: '/teachers/community/events', icon: Calendar },
            { name: 'Success Stories', href: '/teachers/community/success-stories', icon: Trophy },
            { name: 'Learning Groups', href: '/teachers/community/learning-groups', icon: Users },
            { name: 'Local Partnerships', href: '/teachers/community/partnerships', icon: MapPin },
            { name: 'Community Guidelines', href: '/teachers/community/guidelines', icon: FileText },
            { name: 'Neighborhood Spotlights', href: '/teachers/community/spotlights', icon: Globe }
          ]
        }
      ],
      sponsor: [
        {
          name: 'Sponsor Community',
          icon: Users,
          dropdown: [
            { name: 'Forums', href: '/sponsors/community/forums', icon: MessageSquare },
            { name: 'Events & Workshops', href: '/sponsors/community/events', icon: Calendar },
            { name: 'Success Stories', href: '/sponsors/community/success-stories', icon: Trophy },
            { name: 'Learning Groups', href: '/sponsors/community/learning-groups', icon: Users },
            { name: 'Local Partnerships', href: '/sponsors/community/partnerships', icon: MapPin },
            { name: 'Community Guidelines', href: '/sponsors/community/guidelines', icon: FileText },
            { name: 'Neighborhood Spotlights', href: '/sponsors/community/spotlights', icon: Globe }
          ]
        },
        { name: 'Advertisements', href: '/sponsors/advertisements', icon: Megaphone }
      ],
      student: [
        {
          name: 'Community',
          icon: Users,
          dropdown: [
            { name: 'Forums', href: '/students/community/forums', icon: MessageSquare },
            { name: 'Events & Workshops', href: '/students/community/events', icon: Calendar },
            { name: 'Success Stories', href: '/students/community/success-stories', icon: Trophy },
            { name: 'Learning Groups', href: '/students/community/learning-groups', icon: Users },
            { name: 'Local Partnerships', href: '/students/community/partnerships', icon: MapPin },
            { name: 'Community Guidelines', href: '/students/community/guidelines', icon: FileText },
            { name: 'Neighborhood Spotlights', href: '/students/community/spotlights', icon: Globe }
          ]
        },
        {
          name: 'Subjects',
          icon: Network,
          dropdown: [
            { name: 'Find Teachers', href: '/students/network/find-teachers', icon: UserPlus },
            { name: 'Advertisements', href: '/students/network/advertisements', icon: Megaphone }
          ]
        }
      ]
    };

    const endItems: NavigationItem[] = [
      { name: 'About Us', href: roleRoute(userRole, 'about'), icon: Users },
      { name: 'Contact Us', href: roleRoute(userRole, 'contact'), icon: Phone }
    ];

    return [
      ...commonItems,
      ...(roleSpecificItems[userRole] || []),
      ...endItems
    ];
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout?.();
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      clearUserSettings();
      clearProfile();
      localStorage.removeItem('current_user');

      router.push('/');
    }
  };

  const toggleDropdown = (dropdownName: string) => {
    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
  };

  const navigationItems = getNavigationItems();

  return (
    <nav
      id="navigation"
      tabIndex={-1}
      aria-label="Main navigation"
      className="fixed top-0 left-0 right-0 z-50 bg-espresso/95 backdrop-blur-md border-b border-cream/10 h-16 outline-none"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          {}
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity" aria-label="SkillHub home">
              <Logo size="sm" />
              <p className="text-[11px] text-mustard/90 capitalize hidden sm:block tracking-wide font-semibold">{userRole} portal</p>
            </Link>
            {userRole === 'student' && <TrackBadge className="ml-3 hidden sm:inline-flex" />}
          </div>

          {}
          <div className="hidden lg:flex items-center flex-1 justify-start pl-16">
            <div className="flex items-center space-x-8">
              {navigationItems.map((item) => (
                <div key={item.name} className="relative navbar-item">
                  {item.dropdown ? (
                    <div className="relative group">
                      <motion.button
                        onClick={() => toggleDropdown(item.name)}
                        className={`flex items-center space-x-2 py-2 text-sm font-semibold text-cream/80 hover:text-cream transition-all whitespace-nowrap border-b-2 border-transparent hover:border-mustard ${
                          activeDropdown === item.name ? 'text-cream border-mustard' : ''
                        }`}
                      >
                        <span>{item.name}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${
                          activeDropdown === item.name ? 'rotate-180' : ''
                        }`} />

                      </motion.button>
                      <AnimatePresence>
                        {activeDropdown === item.name && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 5 }}
                            className="absolute top-full left-0 mt-2 w-64 bg-cream-50 shadow-kid-lg rounded-2xl border-2 border-espresso z-50 overflow-hidden"
                          >
                            {item.dropdown.map((dropdownItem) => (
                              <motion.div key={dropdownItem.name}>
                                <Link
                                  href={dropdownItem.href}
                                  className="flex items-center space-x-3 px-4 py-3 text-sm text-espresso hover:text-terracotta hover:bg-cream-100 transition-colors"
                                  onClick={() => setActiveDropdown(null)}
                                >
                                  <dropdownItem.icon className="w-4 h-4" />
                                  <span>{dropdownItem.name}</span>
                                </Link>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div>
                      <Link
                        href={item.href!}
                        className="block py-2 text-sm font-semibold text-cream/80 hover:text-cream transition-all whitespace-nowrap border-b-2 border-transparent hover:border-mustard"
                      >
                        {item.name}
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {}
          <div className="hidden md:flex items-center space-x-3 flex-shrink-0 mr-6">
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => toggleDropdown('search')}
                className="flex items-center justify-center w-9 h-9 text-cream/80 hover:text-cream rounded-full hover:bg-cream/10 transition-colors"
              >
                <Search className="w-5 h-5" />
              </motion.button>

              <AnimatePresence>
                {activeDropdown === 'search' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full right-0 mt-2 w-80 bg-cream-50 shadow-kid-lg rounded-2xl border-2 border-espresso z-50"
                  >
                    <div className="p-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-espresso/50" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={`Search ${userRole} resources...`}
                          className="w-full pl-10 pr-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-full text-sm text-espresso placeholder:text-espresso/50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                          autoFocus
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {}
            <PWAInstallButton className="hidden md:inline-flex" />

            {}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => toggleDropdown('notifications')}
                className="flex items-center justify-center w-9 h-9 text-cream/80 hover:text-cream rounded-full hover:bg-cream/10 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-terracotta text-cream text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-espresso">
                    {notificationCount}
                  </span>
                )}
              </motion.button>

              <AnimatePresence>
                {activeDropdown === 'notifications' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full right-0 mt-2 w-80 bg-cream-50 border-2 border-espresso rounded-2xl shadow-kid-lg z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b-2 border-espresso/10 bg-espresso text-cream">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-bold">{t('nav.notifications')}</h3>
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-xs font-semibold text-mustard hover:text-cream"
                        >
                          {t('nav.markAllRead')}
                        </button>
                      </div>
                      {showEnablePush && (
                        <button
                          onClick={handleEnablePush}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-mustard text-espresso px-3 py-1 text-xs font-bold hover:bg-mustard-400"
                        >
                          <Bell className="w-3 h-3" />
                          {t('nav.enablePush')}
                        </button>
                      )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {notificationsData.length > 0 ? notificationsData.map((notification) => (
                        <motion.div
                          key={notification.id}
                          whileHover={{ x: 5 }}
                          onClick={() => handleNotificationClick(notification)}
                          className={`px-4 py-3 border-b border-espresso/8 last:border-b-0 cursor-pointer hover:bg-cream-100 ${
                            isUnread(notification) ? 'bg-mustard/15' : ''
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-2.5 h-2.5 rounded-full mt-2 ${
                              notification.type === 'success' ? 'bg-forest' :
                              notification.type === 'warning' ? 'bg-mustard' :
                              notification.priority === 'high' ? 'bg-coral' :
                              'bg-terracotta'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-espresso">
                                {notification.title}
                              </p>
                              <p className="text-sm text-espresso/70 mt-1">
                                {notification.message}
                              </p>
                              <p className="text-xs text-espresso/50 mt-2">
                                {notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}
                              </p>
                            </div>
                            {isUnread(notification) && (
                              <div className="w-2 h-2 bg-terracotta rounded-full flex-shrink-0 mt-2" />
                            )}
                          </div>
                        </motion.div>
                      )) : (
                        <div className="px-4 py-8 text-center">
                          <p className="text-sm text-espresso/60">{t('nav.noNotifications')}</p>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3 border-t-2 border-espresso/10 bg-cream-100">
                      <button
                        onClick={() => {
                          setShowAllNotifications(true);
                          setActiveDropdown(null);
                        }}
                        className="w-full text-center text-sm text-terracotta hover:text-terracotta-500 font-bold"
                      >
                        {t('nav.viewAllNotifications')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => toggleDropdown('user')}
                className="flex items-center justify-center w-9 h-9 text-cream/80 hover:text-cream rounded-full hover:bg-cream/10 transition-colors"
              >
                <User className="w-5 h-5" />
              </motion.button>

              <AnimatePresence>
                {activeDropdown === 'user' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full right-0 mt-2 w-56 bg-cream-50 border-2 border-espresso rounded-2xl shadow-kid-lg z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-espresso text-cream">
                      <p className="font-display font-bold truncate">{userName}</p>
                      <p className="text-xs text-cream/65 truncate">{userEmail}</p>
                    </div>

                    <motion.div whileHover={{ x: 5 }}>
                      <Link
                        href={roleRoute(userRole, 'profile')}
                        className="flex items-center space-x-3 px-4 py-3 text-sm font-semibold text-espresso hover:text-terracotta hover:bg-cream-100"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </Link>
                    </motion.div>

                    <motion.div whileHover={{ x: 5 }}>
                      <Link
                        href={roleRoute(userRole, 'settings')}
                        className="flex items-center space-x-3 px-4 py-3 text-sm font-semibold text-espresso hover:text-terracotta hover:bg-cream-100"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </Link>
                    </motion.div>

                    <motion.button
                      onClick={handleLogout}
                      whileHover={{ x: 5 }}
                      className="flex items-center space-x-3 px-4 py-3 text-sm font-semibold text-coral hover:bg-coral/10 w-full text-left border-t-2 border-espresso/10"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden rounded-full p-2 text-cream hover:bg-cream/10"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </motion.button>
        </div>
      </div>

      {}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-espresso border-t border-cream/10"
          >
            <div className="px-4 py-4 space-y-2">
              {}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-cream/50" />
                <input
                  type="text"
                  placeholder={`Search ${userRole} resources...`}
                  className="pl-10 pr-4 py-2 w-full text-sm bg-espresso-600 border-2 border-cream/15 rounded-full text-cream placeholder:text-cream/45 focus:outline-none focus:border-mustard"
                />
              </div>

              {}
              {navigationItems.map((item) => (
                <div key={item.name}>
                  {item.dropdown ? (
                    <div>
                      <motion.button
                        whileHover={{ x: 5 }}
                        onClick={() => toggleDropdown(`mobile-${item.name}`)}
                        className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-cream/85 hover:text-cream hover:bg-cream/10 rounded-2xl"
                      >
                        <div className="flex items-center space-x-3">
                          <item.icon className="w-4 h-4" />
                          <span>{item.name}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${
                          activeDropdown === `mobile-${item.name}` ? 'rotate-180' : ''
                        }`} />
                      </motion.button>
                      
                      <AnimatePresence>
                        {activeDropdown === `mobile-${item.name}` && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="ml-4 mt-2 space-y-1"
                          >
                            {item.dropdown.map((dropdownItem) => (
                              <motion.div key={dropdownItem.name} whileHover={{ x: 5 }}>
                                <Link
                                  href={dropdownItem.href}
                                  className="flex items-center space-x-3 px-4 py-2 text-sm text-cream/75 hover:text-mustard hover:bg-cream/5 rounded-2xl"
                                >
                                  <dropdownItem.icon className="w-4 h-4" />
                                  <span>{dropdownItem.name}</span>
                                </Link>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <motion.div whileHover={{ x: 5 }}>
                      <Link
                        href={item.href!}
                        className="flex items-center space-x-3 px-4 py-3 text-sm font-semibold text-cream/85 hover:text-cream hover:bg-cream/10 rounded-2xl"
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.name}</span>
                      </Link>
                    </motion.div>
                  )}
                </div>
              ))}

              {}
              <div className="border-t border-cream/10 pt-4 mt-4">
                <div className="flex items-center space-x-3 px-4 py-3">
                  <div className="w-11 h-11 bg-terracotta rounded-2xl flex items-center justify-center border-2 border-cream/20">
                    <User className="w-5 h-5 text-cream" />
                  </div>
                  <div>
                    <p className="font-display font-bold text-cream">{userName}</p>
                    <p className="text-xs text-mustard capitalize">{userRole}</p>
                  </div>
                </div>

                <motion.button
                  onClick={handleLogout}
                  whileHover={{ x: 5 }}
                  className="flex items-center space-x-3 px-4 py-3 text-sm font-semibold text-coral hover:bg-coral/10 w-full text-left rounded-2xl"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {}
      {typeof window !== 'undefined' && createPortal(
        <>
          {}
          <AnimatePresence>
            {showNotificationDetail && selectedNotification && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
                onClick={() => setShowNotificationDetail(false)}
              >
                <motion.div
                  ref={notificationDetailRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="notification-detail-title"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-cream-50 border-2 border-espresso rounded-3xl shadow-kid-lg w-full max-w-md overflow-hidden"
                >
                  <div className="bg-espresso text-cream p-5 flex justify-between items-center">
                    <h3 id="notification-detail-title" className="font-display text-lg font-bold">{t('nav.notificationDetails')}</h3>
                    <button
                      onClick={() => setShowNotificationDetail(false)}
                      className="text-cream/70 hover:text-cream rounded-full p-1 hover:bg-cream/10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-6">
                    <div className="flex items-start space-x-3 mb-4">
                      <div className={`w-3 h-3 rounded-full mt-1.5 ${
                        selectedNotification.type === 'success' ? 'bg-forest' :
                        selectedNotification.type === 'warning' ? 'bg-mustard' :
                        selectedNotification.type === 'calendar' ? 'bg-terracotta' :
                        selectedNotification.type === 'message' ? 'bg-coral' :
                        selectedNotification.type === 'review' ? 'bg-mustard' :
                        selectedNotification.type === 'payment' ? 'bg-forest' :
                        'bg-espresso/50'
                      }`} />
                      <div className="flex-1">
                        <h4 className="font-display font-bold text-espresso mb-1">
                          {selectedNotification.title}
                        </h4>
                        <p className="text-xs text-espresso/60 capitalize mb-2">
                          {selectedNotification.type} notification
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-espresso/80 leading-relaxed">
                        {selectedNotification.message}
                      </p>
                    </div>

                    <div className="text-xs text-espresso/50 mb-4">
                      {selectedNotification.created_at ? new Date(selectedNotification.created_at).toLocaleString() : 'Unknown time'}
                    </div>

                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => setShowNotificationDetail(false)}
                        className="btn-kid-ghost !py-2 !px-4 text-sm"
                      >
                        {t('common.close')}
                      </button>
                      {selectedNotification?.link_url && (
                        <button
                          onClick={() => handleNavigateFromNotification(selectedNotification)}
                          className="btn-kid-primary !py-2 !px-4 text-sm"
                        >
                          {t('common.view')}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {}
          <AnimatePresence>
            {showAllNotifications && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
                onClick={() => setShowAllNotifications(false)}
              >
                <motion.div
                  ref={allNotificationsRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="all-notifications-title"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-cream-50 border-2 border-espresso rounded-3xl shadow-kid-lg w-full max-w-2xl max-h-[80vh] overflow-hidden"
                >
                  <div className="bg-espresso text-cream p-5 flex justify-between items-center">
                    <h3 id="all-notifications-title" className="font-display text-lg font-bold">{t('nav.notifications')}</h3>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-sm font-semibold text-mustard hover:text-cream"
                      >
                        {t('nav.markAllRead')}
                      </button>
                      <button
                        onClick={() => setShowAllNotifications(false)}
                        className="text-cream/70 hover:text-cream rounded-full p-1 hover:bg-cream/10"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-0 max-h-[60vh] overflow-y-auto">
                    {notificationsData.length > 0 ? (
                      <div className="space-y-0">
                        {notificationsData.map((notification) => (
                          <motion.div
                            key={notification.id}
                            whileHover={{ backgroundColor: 'rgba(43,31,24,0.04)' }}
                            onClick={() => handleNotificationClick(notification)}
                            className={`px-6 py-4 border-b border-espresso/8 last:border-b-0 cursor-pointer transition-colors ${
                              isUnread(notification) ? 'bg-mustard/15' : ''
                            }`}
                          >
                            <div className="flex items-start space-x-3">
                              <div className={`w-3 h-3 rounded-full mt-1.5 ${
                                notification.type === 'success' ? 'bg-forest' :
                                notification.type === 'warning' ? 'bg-mustard' :
                                notification.type === 'calendar' ? 'bg-terracotta' :
                                notification.type === 'message' ? 'bg-coral' :
                                notification.type === 'review' ? 'bg-mustard' :
                                notification.type === 'payment' ? 'bg-forest' :
                                notification.priority === 'high' ? 'bg-coral' :
                                'bg-espresso/50'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-display font-semibold text-espresso">
                                      {notification.title}
                                    </p>
                                    <p className="text-sm text-espresso/70 mt-1 line-clamp-2">
                                      {notification.message}
                                    </p>
                                    <p className="text-xs text-espresso/50 mt-2">
                                      {notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}
                                    </p>
                                  </div>
                                  {isUnread(notification) && (
                                    <div className="w-2 h-2 bg-terracotta rounded-full flex-shrink-0 mt-2 ml-3" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-6 py-12 text-center">
                        <Bell className="w-16 h-16 mx-auto text-espresso/25 mb-3" />
                        <p className="text-espresso/65">{t('nav.noNotifications')}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </nav>
  );
};

export default AuthenticatedNavigation;