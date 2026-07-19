'use client';

/**
 * Student wishlist. The backend (GET/POST/DELETE /students/wishlist) was
 * fully built and working with zero frontend anywhere in the app — this
 * page plus the "Add to wishlist" toggle on the content-library cards are
 * the first callers.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, Trash2, Loader2 } from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';

interface WishlistItem {
  wishlist_id: string;
  course_id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  price: number;
  teacher_name: string;
  subject: string;
  added_at: string;
}

export default function WishlistPage() {
  const router = useRouter();
  const { language } = useTranslation();
  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Student'}`.trim();
  const userEmail = currentUser?.email || '';

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await apiClient.getStudentWishlist();
      setItems(res?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load your wishlist.');
    } finally {
      setIsLoading(false);
    }
  };

  const remove = async (courseId: string) => {
    setRemovingId(courseId);
    try {
      await apiClient.removeFromWishlist(courseId);
      setItems((prev) => prev.filter((i) => i.course_id !== courseId));
    } catch (err: any) {
      setError(err?.message || 'Could not remove that item.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />
      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
          <PageHeader title="Your" accent="wishlist" />

          {error && (
            <KidCard tone="cream" className="border-coral !p-5">
              <p className="text-coral font-semibold">{error}</p>
            </KidCard>
          )}

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-espresso/45" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              size="lg"
              illustration="empty-search"
              title="Nothing saved yet"
              body="Bookmark courses from the content library to keep track of what you want to take next."
              actions={
                <Link href="/students/content-library" className="btn-kid-primary !py-2 !px-5 text-sm">
                  Browse content
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <KidCard key={item.wishlist_id} tone="cream" className="!p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-terracotta/15 text-terracotta shrink-0">
                      <Bookmark className="w-5 h-5" />
                    </div>
                    <button
                      onClick={() => remove(item.course_id)}
                      disabled={removingId === item.course_id}
                      aria-label={`Remove ${item.title} from wishlist`}
                      className="p-2 rounded-full text-espresso/45 hover:text-coral hover:bg-coral/10 transition-colors disabled:opacity-50"
                    >
                      {removingId === item.course_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <h3 className="font-display font-bold text-espresso leading-snug">{item.title}</h3>
                  <p className="text-xs text-espresso/55 mt-1">{item.subject} &middot; {item.teacher_name}</p>
                  {item.description && (
                    <p className="text-sm text-espresso/70 mt-2 line-clamp-2 flex-1">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-4">
                    <span className="font-semibold text-espresso">
                      {formatCurrency(item.price || 0, { locale: language })}
                    </span>
                    <span className="text-xs text-espresso/45">
                      Saved {new Date(item.added_at).toLocaleDateString()}
                    </span>
                  </div>
                </KidCard>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
