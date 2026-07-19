'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash,
  Users,
  Clock,
  MapPin,
  Monitor,
  X
} from 'lucide-react';

type AppUserRole = 'student' | 'teacher' | 'sponsor';

interface ScheduleEvent {
  id: string;
  title: string;
  subject: string;
  grade: string;
  type: string;
  startTime: string;
  endTime: string;
  date: string;
  location: string;
  isOnline: boolean;
  students: number;
  description: string;
  status: string;
  student?: {
    id?: string;
    email?: string;
    profile?: {
      first_name?: string;
      last_name?: string;
    };
  };
}

interface ScheduleItem {
  id: string;
  title: string;
  description?: string;
  session_type: string;
  session_mode: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  meeting_link?: string;
  location?: string;
  max_participants?: number;
  current_participants: number;
  recording_enabled: boolean;
  is_recurring: boolean;
  created_at: string;
  course?: {
    title: string;
    level?: string;
    subject?: { name: string };
  };
  student?: {
    id?: string;
    email?: string;
    profile?: {
      first_name?: string;
      last_name?: string;
    };
  };
}

interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  pattern: {
    [key: string]: Array<{ start: string; end: string }>;
  };
  is_default: boolean;
}

interface ScheduleData {
  appointments: ScheduleItem[];
  availability_blocks: ScheduleItem[];
  regular_sessions: ScheduleItem[];
  templates: ScheduleTemplate[];
  analytics: {
    total_appointments: number;
    upcoming_appointments: number;
    completed_appointments: number;
    cancelled_appointments: number;
    available_time_blocks: number;
    booked_time_blocks: number;
    utilization_rate: number;
    average_appointment_duration: number;
    busiest_day?: string;
    peak_hours?: string;
  };
}

interface Conflict {
  withEvent: ScheduleEvent;
  overlapMinutes: number;
}

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const humanDateFromKey = (key: string) => {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return key;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString();
};

const toDisplayTime = (dateString: string) => {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const getMonthMatrix = (date: Date) => {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(firstDayOfMonth);
  const matrix: { date: Date; inCurrentMonth: boolean }[][] = [];

  let current = new Date(start);
  for (let row = 0; row < 6; row++) {
    const week: { date: Date; inCurrentMonth: boolean }[] = [];
    for (let col = 0; col < 7; col++) {
      week.push({
        date: new Date(current),
        inCurrentMonth: current.getMonth() === date.getMonth()
      });
      current = addDays(current, 1);
    }
    matrix.push(week);
  }
  return matrix;
};

const minutesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) => {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return Math.max(0, Math.floor((end - start) / 60000));
};

const normalizeRole = (role: unknown): AppUserRole => {
  const v = typeof role === 'string' ? role.toLowerCase() : '';
  if (v === 'teacher' || v === 'student' || v === 'sponsor') return v;
  return 'teacher';
};

const TeacherSchedulePage: React.FC = () => {
  const router = useRouter();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [newAppointmentData, setNewAppointmentData] = useState({
    title: '',
    description: '',
    student_email: '',
    scheduled_start: '',
    scheduled_end: '',
    location: '',
    is_online: true,
    meeting_link: '',
    appointment_type: 'appointment'
  });

  const [newAvailabilityData, setNewAvailabilityData] = useState({
    title: '',
    day_of_week: 'monday',
    start_time: '09:00',
    end_time: '17:00',
    is_recurring: true,
    specific_date: '',
    buffer_minutes: 15,
    notes: ''
  });

  const [createAppointmentLoading, setCreateAppointmentLoading] = useState(false);
  const [createAvailabilityLoading, setCreateAvailabilityLoading] = useState(false);
  const [applyTemplateLoading, setApplyTemplateLoading] = useState(false);
  const [templateStartDate, setTemplateStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [templateWeeksCount, setTemplateWeeksCount] = useState(4);

  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const [contentOffset, setContentOffset] = useState(0);
  const [readyToAnimate, setReadyToAnimate] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastWidthRef = useRef(0);

  const currentUser = useMemo(() => getCurrentUser(), []);
  const rawRoleLower = useMemo(() => {
    const r = currentUser?.role;
    return typeof r === 'string' ? r.toLowerCase() : '';
  }, [currentUser?.role]);

  const userRole: AppUserRole = useMemo(
    () => normalizeRole(currentUser?.role),
    [currentUser?.role]
  );

  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Teacher'}`.trim();
  const userEmail = currentUser?.email || 'demo@teacher.com';

  const getSubjectByType = (type: string): string => {
    return type || 'General';
  };

  const transformItemsToEvents = useCallback((items: ScheduleItem[]) => {
    const transformed: ScheduleEvent[] = items.map((item: ScheduleItem) => {
      const start = new Date(item.scheduled_start);
      return {
        id: item.id,
        title: item.title,
        subject: item.course?.subject?.name || getSubjectByType(item.session_type),
        grade: item.course?.level || 'All',
        type: item.session_type,
        startTime: toDisplayTime(item.scheduled_start),
        endTime: toDisplayTime(item.scheduled_end),
        date: toDateKey(start),
        location: item.session_mode === 'online' ? 'Online' : item.location || 'TBD',
        isOnline: item.session_mode === 'online',
        students: item.current_participants || 0,
        description: item.description || '',
        status: item.status,
        student: item.student
      };
    });
    return transformed;
  }, []);

  const fetchScheduleData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const response = await apiClient.getTeacherSchedule();

      const appointments = Array.isArray(response?.appointments) ? response.appointments : [];
      const availabilityBlocks = Array.isArray(response?.availability_blocks) ? response.availability_blocks : [];
      const regularSessions = Array.isArray(response?.regular_sessions) ? response.regular_sessions : [];
      const templates = Array.isArray(response?.templates) ? response.templates : [];

      const safeScheduleData: ScheduleData = {
        appointments,
        availability_blocks: availabilityBlocks,
        regular_sessions: regularSessions,
        templates,
        analytics: {
          total_appointments: response?.analytics?.total_appointments ?? 0,
          upcoming_appointments: response?.analytics?.upcoming_appointments ?? 0,
          completed_appointments: response?.analytics?.completed_appointments ?? 0,
          cancelled_appointments: response?.analytics?.cancelled_appointments ?? 0,
          available_time_blocks: response?.analytics?.available_time_blocks ?? 0,
          booked_time_blocks: response?.analytics?.booked_time_blocks ?? 0,
          utilization_rate: response?.analytics?.utilization_rate ?? 0,
          average_appointment_duration: response?.analytics?.average_appointment_duration ?? 0,
          busiest_day: response?.analytics?.busiest_day,
          peak_hours: response?.analytics?.peak_hours
        }
      };

      setScheduleData(safeScheduleData);

      const allItems: ScheduleItem[] = [
        ...appointments,
        ...availabilityBlocks,
        ...regularSessions
      ];

      const transformedEvents = transformItemsToEvents(allItems);
      setScheduleEvents(transformedEvents);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch schedule data';
      setError(message);
      setScheduleData({
        appointments: [],
        availability_blocks: [],
        regular_sessions: [],
        templates: [],
        analytics: {
          total_appointments: 0,
          upcoming_appointments: 0,
          completed_appointments: 0,
          cancelled_appointments: 0,
          available_time_blocks: 0,
          booked_time_blocks: 0,
          utilization_rate: 0,
          average_appointment_duration: 0
        }
      });
      setScheduleEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [transformItemsToEvents]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/');
      return;
    }
    if (rawRoleLower && rawRoleLower !== 'teacher') {
      router.push('/');
      return;
    }
    fetchScheduleData();
  }, [router, rawRoleLower, fetchScheduleData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const selectors = [
      '[data-dashboard-sidebar]',
      '#dashboard-sidebar',
      'aside[aria-label*="Dashboard"]',
      'nav[aria-label*="Dashboard"]',
      '.dashboard-sidebar'
    ];

    const findSidebarEl = (): HTMLElement | null => {
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      const asides = Array.from(document.querySelectorAll<HTMLElement>('aside, nav'));
      return (
        asides.find((el) => /dashboard|teacher dashboard/i.test(el.textContent || '')) ||
        null
      );
    };

    const clamp = (val: number, min: number, max: number) =>
      Math.max(min, Math.min(max, val));

    const measure = (el: HTMLElement): number => {
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const rect = el.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      if (visibleWidth < 1) {
        const looksOpen =
          el.getAttribute('data-open') === 'true' ||
          el.getAttribute('aria-hidden') === 'false' ||
          el.classList.contains('open') ||
          el.classList.contains('is-open');
        if (looksOpen) return 256;
      }
      return visibleWidth;
    };

    const collapsedThreshold = 100;
    const openThreshold = 140;
    const maxWidth = 320;
    const minOpenWidth = 200;

    let sidebarEl = findSidebarEl();

    const update = () => {
      const isLarge = window.innerWidth >= 1024;
      if (!isLarge) {
        setSidebarOpen(false);
        setContentOffset(0);
        return;
      }
      sidebarEl ||= findSidebarEl();
      if (!sidebarEl) {
        setSidebarOpen(false);
        setContentOffset(0);
        return;
      }

      const rawWidth = clamp(measure(sidebarEl), 0, maxWidth);

      setSidebarOpen((prev) => {
        if (prev) {
          if (rawWidth <= collapsedThreshold) return false;
          return true;
        }
        if (rawWidth >= openThreshold) return true;
        return false;
      });

      const nextOffset = rawWidth >= openThreshold ? Math.max(minOpenWidth, rawWidth) : 0;

      const last = lastWidthRef.current || 0;
      const smooth = Math.abs(nextOffset - last) > 200 ? (last * 0.7 + nextOffset * 0.3) : nextOffset;

      lastWidthRef.current = smooth;
      setContentOffset(smooth);
    };

    update();
    setReadyToAnimate(true);

    let mo: MutationObserver | null = null;
    if (sidebarEl) {
      mo = new MutationObserver(update);
      mo.observe(sidebarEl, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-open', 'aria-hidden']
      });
    }

    const onResize = () => update();
    window.addEventListener('resize', onResize);

    const customEvents = ['dashboard:sidebar:open', 'dashboard:sidebar:close', 'dashboard:sidebar:toggle'];
    customEvents.forEach((evt) => window.addEventListener(evt as any, update));

    const interval = window.setInterval(update, 500);

    return () => {
      window.removeEventListener('resize', onResize);
      customEvents.forEach((evt) => window.removeEventListener(evt as any, update));
      if (mo) mo.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  const goPrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };

  const goNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of scheduleEvents) {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [scheduleEvents]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate);
    return [...Array(7)].map((_, i) => addDays(start, i));
  }, [currentDate]);

  const findConflicts = (startISO: string, endISO: string): Conflict[] => {
    const start = new Date(startISO);
    const end = new Date(endISO);
    const result: Conflict[] = [];

    for (const ev of scheduleEvents) {
      const dayMatches = ev.date === toDateKey(start);
      if (!dayMatches) continue;

      const items: ScheduleItem[] = [
        ...(scheduleData?.appointments || []),
        ...(scheduleData?.availability_blocks || []),
        ...(scheduleData?.regular_sessions || [])
      ];
      const sameDayItems = items.filter(
        (it) => toDateKey(new Date(it.scheduled_start)) === ev.date
      );

      for (const it of sameDayItems) {
        const itStart = new Date(it.scheduled_start);
        const itEnd = new Date(it.scheduled_end);
        const overlap = minutesOverlap(start, end, itStart, itEnd);
        if (overlap > 0) {
          result.push({
            withEvent: ev,
            overlapMinutes: overlap
          });
        }
      }
    }
    return result;
  };

  const handleCreateAppointment = async () => {
    try {
      setCreateAppointmentLoading(true);
      setError('');

      if (!newAppointmentData.title || !newAppointmentData.scheduled_start || !newAppointmentData.scheduled_end) {
        setError('Please provide title, start, and end time.');
        setCreateAppointmentLoading(false);
        return;
      }

      const detected = findConflicts(
        newAppointmentData.scheduled_start,
        newAppointmentData.scheduled_end
      );
      if (detected.length > 0) {
        setConflicts(detected);
        setShowConflictModal(true);
        setCreateAppointmentLoading(false);
        return;
      }

      const payload = {
        title: newAppointmentData.title,
        description: newAppointmentData.description,
        student_email: newAppointmentData.student_email,
        scheduled_start: newAppointmentData.scheduled_start,
        scheduled_end: newAppointmentData.scheduled_end,
        location: newAppointmentData.location,
        is_online: newAppointmentData.is_online,
        meeting_link: newAppointmentData.meeting_link,
        appointment_type: newAppointmentData.appointment_type
      };

      const createAppointmentFn =
        (apiClient as any).createTeacherAppointment ||
        (apiClient as any).createAppointment;

      if (typeof createAppointmentFn === 'function') {
        await createAppointmentFn(payload);
      } else {
        const start = new Date(newAppointmentData.scheduled_start);
        const optimisticEvent: ScheduleEvent = {
          id: `local-${Date.now()}`,
          title: newAppointmentData.title,
          subject: 'General',
          grade: 'All',
          type: 'appointment',
          startTime: toDisplayTime(newAppointmentData.scheduled_start),
          endTime: toDisplayTime(newAppointmentData.scheduled_end),
          date: toDateKey(start),
          location: newAppointmentData.is_online ? 'Online' : newAppointmentData.location || 'TBD',
          isOnline: newAppointmentData.is_online,
          students: 1,
          description: newAppointmentData.description,
          status: 'scheduled',
          student: newAppointmentData.student_email
            ? { email: newAppointmentData.student_email }
            : undefined
        };
        setScheduleEvents((prev) => [...prev, optimisticEvent]);
      }

      setShowAppointmentModal(false);
      setNewAppointmentData({
        title: '',
        description: '',
        student_email: '',
        scheduled_start: '',
        scheduled_end: '',
        location: '',
        is_online: true,
        meeting_link: '',
        appointment_type: 'appointment'
      });
      await fetchScheduleData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create appointment';
      setError(message);
    } finally {
      setCreateAppointmentLoading(false);
    }
  };

  const handleCreateAvailability = async () => {
    try {
      setCreateAvailabilityLoading(true);
      setError('');

      if (!newAvailabilityData.title) {
        setError('Please provide a title for the availability block.');
        setCreateAvailabilityLoading(false);
        return;
      }

      const payload = {
        title: newAvailabilityData.title,
        day_of_week: newAvailabilityData.day_of_week,
        start_time: newAvailabilityData.start_time,
        end_time: newAvailabilityData.end_time,
        is_recurring: newAvailabilityData.is_recurring,
        specific_date: newAvailabilityData.specific_date || undefined,
        buffer_minutes: newAvailabilityData.buffer_minutes,
        notes: newAvailabilityData.notes
      };

      await apiClient.createAvailabilityBlock(payload);

      setShowAvailabilityModal(false);
      await fetchScheduleData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create availability';
      setError(message);
    } finally {
      setCreateAvailabilityLoading(false);
    }
  };

  const handleApplyTemplate = async (template: ScheduleTemplate) => {
    try {
      setApplyTemplateLoading(true);
      setError('');

      const result = await apiClient.bulkApplyScheduleTemplate({
        template_id: template.id,
        start_date: templateStartDate,
        weeks_count: templateWeeksCount,
      });

      setShowTemplateModal(false);
      if (result?.created === 0) {
        setError('Template applied, but no availability blocks were created for that date range.');
      }
      await fetchScheduleData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to apply template';
      setError(message);
    } finally {
      setApplyTemplateLoading(false);
    }
  };

  const renderEventPill = (ev: ScheduleEvent) => {
    return (
      <button
        key={ev.id}
        onClick={() => setSelectedEvent(ev)}
        className={`w-full text-left px-2 py-1 rounded border mb-1 text-sm hover:opacity-90 ${
          ev.isOnline
            ? 'bg-terracotta/10 border-terracotta/30 text-terracotta-500'
            : 'bg-forest/10 border-forest/30 text-forest-500'
        }`}
        title={ev.title}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3" />
          <span>
            {ev.startTime} - {ev.endTime}
          </span>
        </div>
        <div className="truncate">{ev.title}</div>
      </button>
    );
  };

  const renderMonthView = () => {
    const matrix = getMonthMatrix(currentDate);
    const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="mt-4">
        <div className="grid grid-cols-7 text-xs text-espresso/55">
          {weekDayLabels.map((d) => (
            <div key={d} className="px-2 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {matrix.map((week, i) => (
            <React.Fragment key={`w-${i}`}>
              {week.map(({ date, inCurrentMonth }) => {
                const key = toDateKey(date);
                const events = eventsByDate.get(key) || [];
                const isToday = toDateKey(new Date()) === key;

                return (
                  <div
                    key={key}
                    className={`min-h-[110px] rounded border p-2 flex flex-col ${
                      inCurrentMonth ? 'bg-cream-50' : 'bg-cream-100 text-espresso/45'
                    } ${isToday ? 'border-terracotta' : 'border-espresso/15'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`text-sm font-medium ${isToday ? 'text-terracotta' : ''}`}>
                        {date.getDate()}
                      </div>
                      <button
                        className="text-espresso/45 hover:text-espresso/70"
                        title="Add appointment"
                        onClick={() => {
                          setShowAppointmentModal(true);
                          const localISO = (d: Date) => {
                            const tzOff = d.getTimezoneOffset() * 60000;
                            return new Date(d.getTime() - tzOff).toISOString().slice(0, 16);
                          };
                          const startLocal = new Date(date);
                          startLocal.setHours(9, 0, 0, 0);
                          const endLocal = new Date(date);
                          endLocal.setHours(10, 0, 0, 0);
                          setNewAppointmentData((prev) => ({
                            ...prev,
                            scheduled_start: localISO(startLocal),
                            scheduled_end: localISO(endLocal)
                          }));
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-2 space-y-1">
                      {events.slice(0, 3).map(renderEventPill)}
                      {events.length > 3 && (
                        <div className="text-xs text-espresso/55">+{events.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const days = weekDays;

    return (
      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((d) => {
          const key = toDateKey(d);
          const events = eventsByDate.get(key) || [];
          const isToday = toDateKey(new Date()) === key;

          return (
            <div key={key} className={`rounded border p-2 ${isToday ? 'border-terracotta' : 'border-espresso/15'} bg-cream-50`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <button
                  className="text-espresso/45 hover:text-espresso/70"
                  title="Add appointment"
                  onClick={() => {
                    setShowAppointmentModal(true);
                    const localISO = (dt: Date) => {
                      const tzOff = dt.getTimezoneOffset() * 60000;
                      return new Date(dt.getTime() - tzOff).toISOString().slice(0, 16);
                    };
                    const start = new Date(d);
                    start.setHours(9, 0, 0, 0);
                    const end = new Date(d);
                    end.setHours(10, 0, 0, 0);
                    setNewAppointmentData((prev) => ({
                      ...prev,
                      scheduled_start: localISO(start),
                      scheduled_end: localISO(end)
                    }));
                  }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {events.length === 0 && <div className="text-xs text-espresso/45">No events</div>}
                {events.map(renderEventPill)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDayView = () => {
    const key = toDateKey(currentDate);
    const events = eventsByDate.get(key) || [];
    const friendly = currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    return (
      <div className="mt-4 bg-cream-50 rounded border border-espresso/15 p-4">
        <div className="text-sm text-espresso/55">{friendly}</div>
        <div className="mt-3 space-y-2">
          {events.length === 0 && <div className="text-sm text-espresso/45">No events today.</div>}
          {events.map((ev) => (
            <div
              key={ev.id}
              onClick={() => setSelectedEvent(ev)}
              className="p-3 border rounded hover:bg-cream-100 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{ev.title}</div>
                <div className="text-xs px-2 py-0.5 rounded bg-cream-100 text-espresso/70">{ev.type}</div>
              </div>
              <div className="mt-1 text-sm text-espresso/70 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {ev.startTime} - {ev.endTime}
                </span>
                <span className="inline-flex items-center gap-1">
                  {ev.isOnline ? <Monitor className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  {ev.location}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {ev.students}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const headerTitle = useMemo(() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const start = startOfWeek(currentDate);
      const end = addDays(start, 6);
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      return `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`;
    }
    return currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [currentDate, viewMode]);

  return (
    <div className="min-h-screen bg-cream-100 overflow-x-hidden">
      <AuthenticatedNavigation userRole={userRole} userName={userName} userEmail={userEmail} />

      {}
      <DashboardSidebar userRole={userRole} />

      {}
      <main
        className="flex-1"
        style={{
          marginLeft: sidebarOpen ? contentOffset : 0,
          width: sidebarOpen ? `calc(100% - ${Math.max(0, contentOffset)}px)` : '100%',
          transition: readyToAnimate ? 'margin-left 200ms ease, width 200ms ease' : 'none'
        }}
      >
        {}
        <div className="w-full p-4 md:p-6 mt-16">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-terracotta/15 text-terracotta-500">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-espresso mb-2">Schedule</h1>
                <p className="text-sm text-espresso/55">
                  {userName} · {userEmail} · Role: {userRole}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded bg-forest hover:bg-forest-400 text-white"
                onClick={() => setShowAvailabilityModal(true)}
              >
                <Plus className="w-4 h-4" />
                New availability
              </button>
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded bg-terracotta hover:bg-terracotta-500 text-white"
                onClick={() => setShowAppointmentModal(true)}
              >
                <Plus className="w-4 h-4" />
                New appointment
              </button>
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-cream-50 hover:bg-cream-100"
                onClick={() => setShowTemplateModal(true)}
              >
                <Edit className="w-4 h-4" />
                Templates
              </button>
            </div>
          </div>

          {}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: scheduleData?.analytics.total_appointments ?? 0 },
              { label: 'Upcoming', value: scheduleData?.analytics.upcoming_appointments ?? 0 },
              { label: 'Completed', value: scheduleData?.analytics.completed_appointments ?? 0 },
              { label: 'Cancelled', value: scheduleData?.analytics.cancelled_appointments ?? 0 },
              { label: 'Booked blocks', value: scheduleData?.analytics.booked_time_blocks ?? 0 },
              { label: 'Utilization', value: `${scheduleData?.analytics.utilization_rate ?? 0}%` }
            ].map((a) => (
              <div key={a.label} className="p-3 bg-cream-50 border rounded">
                <div className="text-xs text-espresso/55">{a.label}</div>
                <div className="text-lg font-semibold">{a.value}</div>
              </div>
            ))}
          </div>

          {}
          {error && (
            <div className="mt-4 p-3 rounded border border-coral/30 bg-coral/10 text-coral flex items-start gap-2">
              <X className="w-4 h-4 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          {isLoading && (
            <div className="mt-4 flex items-center gap-2 text-espresso/70">
              <div className="w-4 h-4 rounded-full border-2 border-terracotta border-t-transparent animate-spin" />
              Loading schedule...
            </div>
          )}

          {}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded border bg-cream-50">
              <button className="p-2 hover:bg-cream-100 border-r" onClick={goPrev}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="px-4 py-2 min-w-[180px] text-center font-medium">{headerTitle}</div>
              <button className="p-2 hover:bg-cream-100 border-l" onClick={goNext}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button className="px-3 py-2 rounded border bg-cream-50 hover:bg-cream-100" onClick={goToday}>
              Today
            </button>

            <div className="ml-auto inline-flex rounded overflow-hidden border bg-cream-50">
              <button
                className={`px-3 py-2 ${viewMode === 'month' ? 'bg-espresso text-white' : 'hover:bg-cream-100'}`}
                onClick={() => setViewMode('month')}
              >
                Month
              </button>
              <button
                className={`px-3 py-2 border-l ${viewMode === 'week' ? 'bg-espresso text-white' : 'hover:bg-cream-100'}`}
                onClick={() => setViewMode('week')}
              >
                Week
              </button>
              <button
                className={`px-3 py-2 border-l ${viewMode === 'day' ? 'bg-espresso text-white' : 'hover:bg-cream-100'}`}
                onClick={() => setViewMode('day')}
              >
                Day
              </button>
            </div>
          </div>

          {}
          {!isLoading && (
            <>
              {viewMode === 'month' && renderMonthView()}
              {viewMode === 'week' && renderWeekView()}
              {viewMode === 'day' && renderDayView()}
            </>
          )}
        </div>
      </main>

      {}
      <button
        className="fixed bottom-6 right-6 rounded-full bg-terracotta hover:bg-terracotta-500 text-white p-4 shadow-lg md:hidden"
        title="New appointment"
        onClick={() => setShowAppointmentModal(true)}
      >
        <Plus className="w-5 h-5" />
      </button>

      {}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-cream-50 w-full max-w-lg rounded shadow-lg"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-semibold">{selectedEvent.title}</div>
                <button onClick={() => setSelectedEvent(null)} className="text-espresso/55 hover:text-espresso">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-sm text-espresso/70">{selectedEvent.description || 'No description'}</div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-espresso/55" />
                  {humanDateFromKey(selectedEvent.date)} {selectedEvent.startTime} - {selectedEvent.endTime}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {selectedEvent.isOnline ? <Monitor className="w-4 h-4 text-espresso/55" /> : <MapPin className="w-4 h-4 text-espresso/55" />}
                  {selectedEvent.location}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Users className="w-4 h-4 text-espresso/55" />
                  {selectedEvent.students}
                </div>
                {selectedEvent.student?.email && (
                  <div className="text-sm text-espresso/70">
                    Student: {selectedEvent.student?.profile?.first_name} {selectedEvent.student?.profile?.last_name} ({selectedEvent.student.email})
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex items-center justify-between">
                <div className="text-xs px-2 py-0.5 rounded bg-cream-100 text-espresso/70">{selectedEvent.type}</div>
                <div className="flex items-center gap-2">
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded border hover:bg-cream-100">
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-coral/30 text-coral hover:bg-coral/10">
                    <Trash className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {showAppointmentModal && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-cream-50 w-full max-w-xl rounded shadow-lg"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-semibold">New Appointment</div>
                <button onClick={() => setShowAppointmentModal(false)} className="text-espresso/55 hover:text-espresso">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm text-espresso mb-1">Title</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={newAppointmentData.title}
                    onChange={(e) => setNewAppointmentData({ ...newAppointmentData, title: e.target.value })}
                    placeholder="e.g., Algebra 1 tutoring"
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Start</label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded px-3 py-2"
                    value={newAppointmentData.scheduled_start}
                    onChange={(e) => setNewAppointmentData({ ...newAppointmentData, scheduled_start: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">End</label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded px-3 py-2"
                    value={newAppointmentData.scheduled_end}
                    onChange={(e) => setNewAppointmentData({ ...newAppointmentData, scheduled_end: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Student email</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={newAppointmentData.student_email}
                    onChange={(e) => setNewAppointmentData({ ...newAppointmentData, student_email: e.target.value })}
                    placeholder="student@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Location</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={newAppointmentData.location}
                    onChange={(e) => setNewAppointmentData({ ...newAppointmentData, location: e.target.value })}
                    placeholder="Room 204"
                    disabled={newAppointmentData.is_online}
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-espresso">
                    <input
                      type="checkbox"
                      checked={newAppointmentData.is_online}
                      onChange={(e) => setNewAppointmentData({ ...newAppointmentData, is_online: e.target.checked })}
                    />
                    Online session
                  </label>
                  {newAppointmentData.is_online && (
                    <div className="mt-2">
                      <label className="block text-sm text-espresso mb-1">Meeting link</label>
                      <input
                        className="w-full border rounded px-3 py-2"
                        value={newAppointmentData.meeting_link}
                        onChange={(e) => setNewAppointmentData({ ...newAppointmentData, meeting_link: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  )}
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm text-espresso mb-1">Description</label>
                  <textarea
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    value={newAppointmentData.description}
                    onChange={(e) => setNewAppointmentData({ ...newAppointmentData, description: e.target.value })}
                    placeholder="Add notes..."
                  />
                </div>
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <button className="px-3 py-2 rounded border hover:bg-cream-100" onClick={() => setShowAppointmentModal(false)}>
                  Cancel
                </button>
                <button
                  disabled={createAppointmentLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded bg-terracotta hover:bg-terracotta-500 text-white disabled:opacity-60"
                  onClick={handleCreateAppointment}
                >
                  {createAppointmentLoading && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {showAvailabilityModal && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-cream-50 w-full max-w-xl rounded shadow-lg"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-semibold">New Availability</div>
                <button onClick={() => setShowAvailabilityModal(false)} className="text-espresso/55 hover:text-espresso">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm text-espresso mb-1">Title</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.title}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, title: e.target.value })}
                    placeholder="Office Hours"
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Day of week</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.day_of_week}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, day_of_week: e.target.value })}
                  >
                    {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Start time</label>
                  <input
                    type="time"
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.start_time}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">End time</label>
                  <input
                    type="time"
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.end_time}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, end_time: e.target.value })}
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-espresso">
                    <input
                      type="checkbox"
                      checked={newAvailabilityData.is_recurring}
                      onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, is_recurring: e.target.checked })}
                    />
                    Recurring weekly
                  </label>
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Specific date (optional)</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.specific_date}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, specific_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-espresso mb-1">Buffer (minutes)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.buffer_minutes}
                    min={0}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, buffer_minutes: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm text-espresso mb-1">Notes</label>
                  <textarea
                    rows={3}
                    className="w-full border rounded px-3 py-2"
                    value={newAvailabilityData.notes}
                    onChange={(e) => setNewAvailabilityData({ ...newAvailabilityData, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <button className="px-3 py-2 rounded border hover:bg-cream-100" onClick={() => setShowAvailabilityModal(false)}>
                  Cancel
                </button>
                <button
                  disabled={createAvailabilityLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded bg-forest hover:bg-forest-400 text-white disabled:opacity-60"
                  onClick={handleCreateAvailability}
                >
                  {createAvailabilityLoading && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {showTemplateModal && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-cream-50 w-full max-w-xl rounded shadow-lg"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-semibold">Apply Template</div>
                <button onClick={() => setShowTemplateModal(false)} className="text-espresso/55 hover:text-espresso">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b">
                  <div>
                    <label className="block text-xs font-medium text-espresso/70 mb-1">Start date</label>
                    <input
                      type="date"
                      value={templateStartDate}
                      onChange={(e) => setTemplateStartDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-espresso/70 mb-1">Weeks</label>
                    <input
                      type="number"
                      min={1}
                      max={26}
                      value={templateWeeksCount}
                      onChange={(e) => setTemplateWeeksCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                </div>
                {(scheduleData?.templates?.length ?? 0) === 0 && (
                  <div className="text-sm text-espresso/55">No templates available.</div>
                )}
                {scheduleData?.templates?.map((t) => (
                  <div key={t.id} className="p-3 border rounded">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {t.name} {t.is_default && <span className="text-xs text-espresso/55">(default)</span>}
                        </div>
                        <div className="text-sm text-espresso/70">{t.description}</div>
                      </div>
                      <button
                        disabled={applyTemplateLoading}
                        className="px-3 py-2 rounded bg-terracotta hover:bg-terracotta-500 text-white disabled:opacity-60"
                        onClick={() => handleApplyTemplate(t)}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t text-right">
                <button className="px-3 py-2 rounded border hover:bg-cream-100" onClick={() => setShowTemplateModal(false)}>
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {showConflictModal && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-cream-50 w-full max-w-lg rounded shadow-lg"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-semibold">Time Conflicts Detected</div>
                <button onClick={() => setShowConflictModal(false)} className="text-espresso/55 hover:text-espresso">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {conflicts.map((c, idx) => (
                  <div key={idx} className="p-3 border rounded bg-mustard/15 border-mustard/40">
                    <div className="font-medium">{c.withEvent.title}</div>
                    <div className="text-sm text-espresso">
                      Overlap: {c.overlapMinutes} minutes · {c.withEvent.startTime} - {c.withEvent.endTime} · {c.withEvent.location}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t text-right">
                <button
                  className="px-3 py-2 rounded bg-espresso text-white hover:opacity-90"
                  onClick={() => setShowConflictModal(false)}
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TeacherSchedulePage;