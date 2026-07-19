'use client';

/**
 * Student-facing teacher profile + reviews.
 *
 * Completes a previously-broken link: the "View Profile" button on
 * /students/network/find-teachers pointed here, but this page never existed.
 * Also the only place a student can leave a review — teacher_profiles
 * .average_rating/.total_reviews are read everywhere (search ranking,
 * sponsor browsing) but nothing wrote them until this page + the
 * POST /students/reviews endpoint existed.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Star, ArrowLeft, Users, Clock } from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';

interface Review {
  id: string;
  rating: number;
  title?: string;
  content?: string;
  created_at: string;
  reviewer_name: string;
}

export default function TeacherProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { language } = useTranslation();
  const teacherId = params.teacherId as string;

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Student'}`.trim();
  const userEmail = currentUser?.email || '';

  const [teacher, setTeacher] = useState<any | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [myRating, setMyRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  const load = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [teacherResp, reviewsResp] = await Promise.all([
        apiClient.findTeachers({ teacher_id: teacherId }),
        apiClient.getTeacherReviews(teacherId).catch(() => ({ reviews: [] })),
      ]);
      const found = teacherResp?.data?.teachers?.[0] || null;
      setTeacher(found);
      setReviews(reviewsResp?.reviews || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load this teacher.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (myRating < 1) {
      setReviewError('Please choose a star rating.');
      return;
    }
    setSubmitting(true);
    setReviewError('');
    try {
      await apiClient.submitTeacherReview({
        teacher_id: teacherId,
        rating: myRating,
        title: reviewTitle.trim() || undefined,
        content: reviewContent.trim() || undefined,
      });
      setReviewSuccess(true);
      setReviewTitle('');
      setReviewContent('');
      await load();
    } catch (err: any) {
      setReviewError(err?.message || 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />
        <div className="flex pt-16">
          <DashboardSidebar userRole="student" />
          <main className="flex-1 p-8">
            <div className="h-40 rounded-2xl bg-espresso/10 animate-pulse" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />
      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
          <Link href="/students/network/find-teachers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-espresso/70 hover:text-espresso">
            <ArrowLeft className="w-4 h-4" /> Back to teachers
          </Link>

          {error && (
            <KidCard tone="cream" className="border-coral !p-5">
              <p className="text-coral font-semibold">{error}</p>
            </KidCard>
          )}

          {!teacher && !error ? (
            <EmptyState size="lg" title="Teacher not found" body="This teacher may no longer be available." />
          ) : teacher ? (
            <>
              <KidCard tone="cream" className="!p-6">
                <div className="flex items-start gap-4">
                  <img
                    src={teacher.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=E97A3C&color=FAF1DD&size=96`}
                    alt={teacher.name}
                    className="w-20 h-20 rounded-full object-cover"
                  />
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold text-espresso">{teacher.name}</h1>
                    <p className="text-espresso/70">{teacher.specialization || 'General'}</p>
                    <div className="flex items-center gap-3 mt-2 text-sm text-espresso/70">
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        {teacher.average_rating ? teacher.average_rating.toFixed(1) : 'New'} ({teacher.total_reviews || 0} review{teacher.total_reviews === 1 ? '' : 's'})
                      </span>
                      <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {teacher.total_students || 0} students</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {teacher.years_experience || 0}+ years</span>
                    </div>
                    {teacher.bio && <p className="text-sm text-espresso/70 mt-3">{teacher.bio}</p>}
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-lg font-semibold text-espresso">{formatCurrency(teacher.hourly_rate || 0, { locale: language })}/hr</span>
                    </div>
                  </div>
                </div>
              </KidCard>

              <KidCard tone="cream" className="!p-6">
                <h2 className="text-lg font-semibold text-espresso mb-4">Leave a review</h2>
                {reviewSuccess && (
                  <p className="text-sm text-forest font-semibold mb-3">Thanks — your review has been saved.</p>
                )}
                {reviewError && (
                  <p className="text-sm text-coral font-semibold mb-3">{reviewError}</p>
                )}
                <form onSubmit={handleSubmitReview} className="space-y-4">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMyRating(n)}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                        className="p-0.5"
                      >
                        <Star
                          className={`w-7 h-7 ${(hoverRating || myRating) >= n ? 'text-yellow-400 fill-current' : 'text-espresso/25'}`}
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  />
                  <textarea
                    value={reviewContent}
                    onChange={(e) => setReviewContent(e.target.value)}
                    rows={3}
                    placeholder="What was it like learning with this teacher? (optional)"
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-kid-primary !py-2 !px-5 text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Submitting…' : 'Submit review'}
                  </button>
                  <p className="text-xs text-espresso/55">
                    You can only review teachers whose courses you're enrolled in.
                  </p>
                </form>
              </KidCard>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-espresso">
                  {reviews.length} review{reviews.length === 1 ? '' : 's'}
                </h2>
                {reviews.length === 0 ? (
                  <EmptyState size="sm" title="No reviews yet" body="Be the first to review this teacher." />
                ) : (
                  reviews.map((r) => (
                    <KidCard key={r.id} tone="cream" className="!p-5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-espresso">{r.reviewer_name}</span>
                        <span className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`w-4 h-4 ${r.rating >= n ? 'text-yellow-400 fill-current' : 'text-espresso/20'}`} />
                          ))}
                        </span>
                      </div>
                      {r.title && <p className="font-medium text-espresso mt-2">{r.title}</p>}
                      {r.content && <p className="text-sm text-espresso/70 mt-1">{r.content}</p>}
                      <p className="text-xs text-espresso/45 mt-2">{new Date(r.created_at).toLocaleDateString()}</p>
                    </KidCard>
                  ))
                )}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
