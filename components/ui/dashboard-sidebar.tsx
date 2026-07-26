"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Calendar,
  CreditCard,
  MessageSquare,
  Settings,
  Library,
  Video,
  Trophy,
  Megaphone,
  Target,
  BarChart3,
  Heart,
  GraduationCap,
  UserPlus,
  PlayCircle,
  Network,
  Award,
  Gift,
  Menu,
  X,
  FileQuestion,
  FileText,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/api";
import {
  Track,
  trackHome,
  trackLibraryHref,
  trackSpecialistHref,
} from "@/lib/accessibility-tracks";

type Role = "student" | "teacher" | "sponsor";

interface SidebarLink {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const links: Record<Role, SidebarLink[]> = {
  // Normal-student nav, trimmed to the core learning flow. Peers, Groups,
  // Campaigns, Redeem Code, Forum, Downloads and Wishlist were removed from the
  // sidebar to declutter it (the pages still exist and are reachable by URL).
  student: [
    { label: "Dashboard", href: "/students/dashboard", icon: LayoutDashboard },
    { label: "Live Sessions", href: "/students/live-sessions", icon: Video },
    { label: "Recordings", href: "/students/recordings", icon: PlayCircle },
    { label: "Pre-recorded Lessons", href: "/students/pre-recorded-lessons", icon: PlayCircle },
    { label: "Content Library", href: "/students/content-library", icon: Library },
    { label: "Exams", href: "/students/exams", icon: FileQuestion },
    { label: "Certificates", href: "/students/certificates", icon: Trophy },
    { label: "Progress Report", href: "/students/progress-report", icon: FileText },
    { label: "Find Teachers", href: "/students/network/find-teachers", icon: UserPlus },
    { label: "Scholarships", href: "/students/scholarships", icon: Award },
    { label: "Events", href: "/students/events", icon: Calendar },
    { label: "Chat", href: "/students/chat", icon: MessageSquare },
    { label: "Meetings", href: "/students/meetings", icon: Video },
    { label: "Payment History", href: "/students/payment-history", icon: CreditCard },
    { label: "Guardians", href: "/students/settings/guardians", icon: Heart },
    { label: "Accessibility", href: "/students/settings/accessibility", icon: Settings },
  ],
  teacher: [
    { label: "Dashboard", href: "/teachers/dashboard", icon: LayoutDashboard },
    { label: "Home", href: "/teachers/home", icon: BookOpen },
    { label: "My Students", href: "/teachers/students", icon: Users },
    { label: "Live Sessions", href: "/teachers/live-sessions", icon: Video },
    { label: "Schedule", href: "/teachers/schedule", icon: Calendar },
    { label: "Content", href: "/teachers/content", icon: Library },
    { label: "Content Management", href: "/teachers/content-management", icon: BookOpen },
    { label: "Accessibility Tracks", href: "/teachers/accessibility-tracks", icon: Heart },
    { label: "Exams", href: "/teachers/exams", icon: FileQuestion },
    { label: "Analytics", href: "/teachers/analytics", icon: BarChart3 },
    { label: "Meetings", href: "/teachers/meetings", icon: Video },
    { label: "Sponsorship", href: "/teachers/sponsorship", icon: Heart },
    { label: "Earnings", href: "/teachers/earnings", icon: Trophy },
    { label: "Payment History", href: "/teachers/payment-history", icon: CreditCard },
    { label: "Specializations", href: "/teachers/settings/specializations", icon: GraduationCap },
    { label: "Accessibility", href: "/teachers/accessibility-specialization", icon: Heart },
  ],
  sponsor: [
    { label: "Dashboard", href: "/sponsors/dashboard", icon: LayoutDashboard },
    { label: "Campaigns", href: "/sponsors/campaigns", icon: Megaphone },
    { label: "Scholarships", href: "/sponsors/scholarships", icon: Award },
    { label: "Access Codes", href: "/sponsors/access-codes", icon: Gift },
    { label: "Connect Teachers", href: "/sponsors/connect-teachers", icon: Network },
    { label: "Events", href: "/sponsors/events", icon: Calendar },
    { label: "Analytics", href: "/sponsors/analytics", icon: BarChart3 },
    { label: "Impact", href: "/sponsors/impact", icon: Sparkles },
  ],
};

const roleAccent: Record<Role, { active: string; hover: string; icon: string }> = {
  student: {
    active: "bg-terracotta text-cream shadow-sticker-sm border-2 border-espresso",
    hover: "hover:bg-cream-100 hover:text-terracotta",
    icon: "text-cream",
  },
  teacher: {
    active: "bg-forest text-cream shadow-sticker-sm border-2 border-espresso",
    hover: "hover:bg-cream-100 hover:text-forest",
    icon: "text-cream",
  },
  sponsor: {
    active: "bg-mustard text-espresso shadow-sticker-sm border-2 border-espresso",
    hover: "hover:bg-cream-100 hover:text-mustard-500",
    icon: "text-espresso",
  },
};

interface DashboardSidebarProps {
  userRole: Role;
}

function SidebarNav({
  items,
  accent,
  pathname,
  onNavigate,
}: {
  items: SidebarLink[];
  accent: { active: string; hover: string; icon: string };
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1.5 px-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all",
              active ? accent.active : cn("text-espresso/75", accent.hover)
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? accent.icon : "text-espresso/50")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const scrollStorageKey = (role: Role) => `dashboard-sidebar-scroll:${role}`;

/**
 * A differently-abled student gets a *curated* navigation — their tailored
 * library and specialist finder plus the shared essentials — instead of the
 * full normal-student menu. This is the sidebar half of the strong separation:
 * the normal-only features (peers, groups, forum, campaigns, wishlist, …)
 * simply aren't surfaced to a track student.
 */
function curatedTrackLinks(track: Track): SidebarLink[] {
  return [
    { label: "Dashboard", href: trackHome(track), icon: LayoutDashboard },
    {
      label: track === "visual" ? "Audio Library" : "Captioned Library",
      href: trackLibraryHref(track),
      icon: Library,
    },
    { label: "Find a Specialist", href: trackSpecialistHref(track), icon: UserPlus },
    { label: "Live Sessions", href: "/students/live-sessions", icon: Video },
    { label: "Recordings", href: "/students/recordings", icon: PlayCircle },
    { label: "Exams", href: "/students/exams", icon: FileQuestion },
    { label: "Certificates", href: "/students/certificates", icon: Trophy },
    { label: "Progress Report", href: "/students/progress-report", icon: FileText },
    { label: "Chat", href: "/students/chat", icon: MessageSquare },
    { label: "Meetings", href: "/students/meetings", icon: Video },
    { label: "Payment History", href: "/students/payment-history", icon: CreditCard },
    { label: "Guardians", href: "/students/settings/guardians", icon: Heart },
    { label: "Accessibility", href: "/students/settings/accessibility", icon: Settings },
  ];
}

/**
 * Track-aware sidebar links. Reads the current user after mount (so SSR still
 * renders the base links and there's no hydration mismatch):
 *  - a differently-abled student gets a curated, track-specific menu
 *  - a specialist teacher gets an extra "Specialist Hub" entry
 */
function useTrackAwareLinks(role: Role): SidebarLink[] {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    try { setUser(getCurrentUser()); } catch { /* ignore */ }
  }, []);
  return useMemo(() => {
    const base = links[role] || [];
    if (!user) return base;
    const track = user.accessibility_track;
    if (role === "student" && (track === "visual" || track === "hearing")) {
      return curatedTrackLinks(track);
    }
    const teaching = Array.isArray(user.teaching_tracks) ? user.teaching_tracks : [];
    if (role === "teacher" && teaching.some((t: string) => t === "visual" || t === "hearing")) {
      const idx = base.findIndex((l) => l.href === "/teachers/dashboard");
      const copy = [...base];
      copy.splice(idx + 1, 0, {
        label: "Specialist Hub",
        href: "/teachers/specialist/dashboard",
        icon: Sparkles,
      });
      return copy;
    }
    return base;
  }, [role, user]);
}

export default function DashboardSidebar({ userRole }: DashboardSidebarProps) {
  const pathname = usePathname();
  const accent = roleAccent[userRole];
  const items = useTrackAwareLinks(userRole);
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The sidebar is rendered fresh by every page (no shared layout), so its
  // scroll container remounts on each navigation and would otherwise reset
  // to the top — restore the last position before paint so it doesn't flash.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(scrollStorageKey(userRole));
    if (saved) el.scrollTop = parseInt(saved, 10);
  }, [userRole]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) sessionStorage.setItem(scrollStorageKey(userRole), String(el.scrollTop));
  };

  useEffect(() => {
    document.body.classList.add("has-dashboard-sidebar");
    return () => {
      document.body.classList.remove("has-dashboard-sidebar");
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-[4.25rem] z-30 inline-flex items-center gap-2 rounded-full border-2 border-espresso bg-cream-50 px-4 py-1.5 text-sm font-bold text-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="h-4 w-4" />
        Menu
      </button>

      {}
      <aside className="hidden lg:flex lg:flex-col fixed left-0 top-16 bottom-0 w-64 border-r-2 border-espresso/10 bg-cream-50 z-20">
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4">
          <SidebarNav items={items} accent={accent} pathname={pathname} />
        </div>
        <div className="border-t-2 border-espresso/10 px-4 py-3 text-[11px] font-bold text-espresso/55 uppercase tracking-[0.15em]">
          SkillHub · v1.0
        </div>
      </aside>

      {}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-espresso/55 backdrop-blur-sm transition-opacity",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Sidebar navigation"
          className={cn(
            "absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col border-r-2 border-espresso bg-cream-50 shadow-kid-lg transition-transform",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-14 items-center justify-between bg-espresso px-4 text-cream">
            <span className="font-display text-base font-bold">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-cream/70 hover:bg-cream/10 hover:text-cream"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            <SidebarNav
              items={items}
              accent={accent}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </div>
          <div className="border-t-2 border-espresso/10 px-4 py-3 text-[11px] font-bold text-espresso/55 uppercase tracking-[0.15em]">
            SkillHub · v1.0
          </div>
        </aside>
      </div>
    </>
  );
}
