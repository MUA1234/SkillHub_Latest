'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, GraduationCap, Wallet, FileWarning, LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { apiClient, getCurrentUser } from '@/lib/api';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { useAdaptiveAccessibility } from '@/contexts/AdaptiveAccessibilityContext';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Teachers', href: '/admin/teachers', icon: GraduationCap },
  { name: 'Payouts', href: '/admin/payouts', icon: Wallet },
  { name: 'Reports', href: '/admin/reports', icon: FileWarning },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearUserSettings } = useAccessibility();
  const { clearProfile } = useAdaptiveAccessibility();

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

  const user = typeof window !== 'undefined' ? (getCurrentUser() as any) : null;

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="sticky top-0 z-40 bg-cream-100/90 backdrop-blur-md border-b border-espresso/8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/admin/dashboard" className="flex items-center shrink-0" aria-label="Admin home">
            <Logo size="sm" priority />
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-semibold text-espresso/75">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
                    active ? 'bg-terracotta/10 text-terracotta' : 'hover:bg-espresso/5'
                  }`}
                >
                  <item.icon className="w-4 h-4" aria-hidden />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user?.email && (
              <span className="hidden sm:inline text-xs text-espresso/60 truncate max-w-[160px]">
                {user.email}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm font-semibold text-coral hover:bg-coral/10 px-3 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        <nav className="md:hidden flex items-center gap-1 overflow-x-auto px-4 pb-2 text-sm font-semibold text-espresso/75">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  active ? 'bg-terracotta/10 text-terracotta' : 'hover:bg-espresso/5'
                }`}
              >
                <item.icon className="w-4 h-4" aria-hidden />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}
