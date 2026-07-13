'use client';

/**
 * Forum post detail + replies.
 *
 * The forum list (app/students/forum/page.tsx) routes every card click
 * to /students/forum/{id}, but the dynamic route never existed — every
 * click was a clean 404. The backend has the read endpoint
 * (`GET /students/forum/posts/{id}`, which returns the post plus all
 * replies in one round trip) and the write endpoint (`POST
 * /students/forum/posts/{id}/replies`), and `apiClient.getForumPost` /
 * `createForumReply` were already wrapped in lib/api.ts with no caller.
 * This page closes that loop.
 *
 * Endpoints used:
 *   GET  /api/v1/students/forum/posts/{id}            — post + replies
 *   POST /api/v1/students/forum/posts/{id}/replies    — new reply
 *   POST /api/v1/students/forum/posts/{id}/vote       — upvote/downvote
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  CheckCircle,
  Clock,
  Send,
  Flag,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, isAuthenticated, getCurrentUser } from '@/lib/api';
import { ReadAloudButton } from '@/components/accessibility/ReadAloudButton';
import { DictateButton } from '@/components/accessibility/DictateButton';
import { useTranslation } from '@/hooks/use-translation';

interface Reply {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_avatar?: string | null;
  upvotes: number;
  is_accepted: boolean;
  created_at: string;
}

interface PostDetail {
  id: string;
  title: string;
  content: string;
  category: string;
  author_id: string;
  author_name: string;
  author_avatar?: string | null;
  upvotes: number;
  downvotes: number;
  is_answered: boolean;
  created_at: string;
  replies: Reply[];
}

export default function ForumPostDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params?.id;
  const { language } = useTranslation();
  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName =
    `${currentUser?.profile?.first_name || ''} ${currentUser?.profile?.last_name || ''}`.trim() ||
    'Student';
  const userEmail = currentUser?.email || '';

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyDraft, setReplyDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    if (postId) loadPost(postId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const loadPost = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const resp = await apiClient.getForumPost(id);
      const data = resp?.data || resp;
      if (!data || !data.id) {
        throw new Error('Post not found');
      }
      setPost(data as PostDetail);
    } catch (err: any) {
      setError(err?.message || 'Could not load this post.');
      setPost(null);
    } finally {
      setLoading(false);
    }
  };

  const formatWhen = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(
        language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK',
        { dateStyle: 'medium', timeStyle: 'short' },
      ).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = replyDraft.trim();
    if (!content || !postId || submitting) return;
    setSubmitting(true);
    try {
      await apiClient.createForumReply(postId, content);
      const optimisticReply: Reply = {
        id: `tmp-${Date.now()}`,
        content,
        author_id: String(currentUser?.id || ''),
        author_name: userName,
        author_avatar: currentUser?.profile?.avatar_url || null,
        upvotes: 0,
        is_accepted: false,
        created_at: new Date().toISOString(),
      };
      setPost((p) =>
        p ? { ...p, replies: [...p.replies, optimisticReply] } : p,
      );
      setReplyDraft('');
    } catch (err: any) {
      alert(err?.message || 'Could not post your reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (voteType: 'upvote' | 'downvote') => {
    if (!post || voting) return;
    setVoting(true);
    const prevUp = post.upvotes;
    const prevDown = post.downvotes;
    setPost({
      ...post,
      upvotes: voteType === 'upvote' ? prevUp + 1 : prevUp,
      downvotes: voteType === 'downvote' ? prevDown + 1 : prevDown,
    });
    try {
      await apiClient.voteOnPost(post.id, voteType);
    } catch (err: any) {
      setPost((p) => (p ? { ...p, upvotes: prevUp, downvotes: prevDown } : p));
      alert(err?.message || 'Could not record your vote.');
    } finally {
      setVoting(false);
    }
  };

  const handleReport = async () => {
    if (!post) return;
    const reason = window.prompt(
      'Why are you reporting this post? (spam / harassment / hate_speech / inappropriate / misinformation / other)',
    );
    if (!reason) return;
    const description = window.prompt(
      'Briefly describe the issue (min 5 chars):',
    );
    if (!description || description.trim().length < 5) return;
    try {
      await apiClient.submitReport({
        category: reason.trim().toLowerCase(),
        description: description.trim(),
        reported_post_id: post.id,
      });
      alert('Report submitted. Thank you.');
    } catch (err: any) {
      alert(err?.message || 'Could not submit the report.');
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole="student" />

      <div className="pt-20 pb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push('/students/forum')}
            className="clay-card px-3 py-2 text-espresso hover:bg-cream-100 inline-flex items-center mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to forum
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-terracotta mr-3" />
              <span className="text-espresso/70">Loading post…</span>
            </div>
          ) : error ? (
            <div className="bg-coral/15 border border-coral text-coral px-4 py-3 rounded flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => postId && loadPost(postId)}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : post ? (
            <>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="clay-card p-6 mb-6"
              >
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold text-espresso mb-2">
                      {post.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-espresso/55">
                      <span className="font-medium text-espresso">
                        {post.author_name}
                      </span>
                      <span className="inline-flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatWhen(post.created_at)}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs bg-forest/10 text-forest-500 capitalize">
                        {post.category}
                      </span>
                      {post.is_answered && (
                        <span className="inline-flex items-center text-forest-500 text-xs font-medium">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Answered
                        </span>
                      )}
                    </div>
                  </div>
                  <ReadAloudButton
                    getText={() => `${post.title}. ${post.content || ''}`}
                    compact
                  />
                </div>

                <p className="text-espresso/85 whitespace-pre-wrap mb-4">
                  {post.content}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-espresso/10">
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      onClick={() => handleVote('upvote')}
                      disabled={voting}
                      className="clay-card px-3 py-2 text-espresso/70 hover:text-forest disabled:opacity-50 inline-flex items-center"
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      {post.upvotes}
                    </button>
                    <button
                      onClick={() => handleVote('downvote')}
                      disabled={voting}
                      className="clay-card px-3 py-2 text-espresso/70 hover:text-coral disabled:opacity-50 inline-flex items-center"
                    >
                      <ThumbsDown className="w-4 h-4 mr-2" />
                      {post.downvotes}
                    </button>
                    <span className="inline-flex items-center text-espresso/55 ml-2">
                      <MessageCircle className="w-4 h-4 mr-1" />
                      {post.replies.length}{' '}
                      {post.replies.length === 1 ? 'reply' : 'replies'}
                    </span>
                  </div>

                  <button
                    onClick={handleReport}
                    className="text-xs text-espresso/55 hover:text-coral inline-flex items-center"
                    title="Report this post"
                  >
                    <Flag className="w-3 h-3 mr-1" />
                    Report
                  </button>
                </div>
              </motion.div>

              <section aria-labelledby="replies-heading" className="mb-6">
                <h2
                  id="replies-heading"
                  className="text-lg font-semibold text-espresso mb-3"
                >
                  Replies
                </h2>

                {post.replies.length === 0 ? (
                  <div className="clay-card p-6 text-center text-espresso/55">
                    No replies yet — be the first to share your thoughts.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {post.replies.map((reply) => (
                      <li
                        key={reply.id}
                        className={`clay-card p-4 ${
                          reply.is_accepted
                            ? 'border-2 border-forest-300'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {reply.author_avatar ? (
                            <img
                              src={reply.author_avatar}
                              alt={reply.author_name}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-cream-300 flex items-center justify-center text-espresso/55 text-sm font-semibold flex-shrink-0">
                              {reply.author_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-medium text-espresso text-sm">
                                {reply.author_name}
                              </span>
                              <span className="text-xs text-espresso/55">
                                {formatWhen(reply.created_at)}
                              </span>
                              {reply.is_accepted && (
                                <span className="inline-flex items-center text-xs text-forest-500 font-medium">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Accepted answer
                                </span>
                              )}
                            </div>
                            <p className="text-espresso/85 whitespace-pre-wrap text-sm">
                              {reply.content}
                            </p>
                            {reply.upvotes > 0 && (
                              <div className="mt-2 text-xs text-espresso/55 inline-flex items-center">
                                <ThumbsUp className="w-3 h-3 mr-1" />
                                {reply.upvotes}
                              </div>
                            )}
                          </div>
                          <ReadAloudButton
                            getText={() => reply.content}
                            compact
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <form
                onSubmit={handleSubmitReply}
                aria-label="Post a reply"
                className="clay-card p-5"
              >
                <label
                  htmlFor="reply-input"
                  className="block text-sm font-medium text-espresso mb-2"
                >
                  Your reply
                </label>
                <div className="relative">
                  <textarea
                    id="reply-input"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    rows={4}
                    maxLength={4000}
                    placeholder="Share what you know, ask a follow-up, or offer encouragement…"
                    className="w-full px-3 py-2 pr-12 border border-espresso/15 rounded-lg text-sm text-espresso bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/40"
                  />
                  <div className="absolute top-2 right-2">
                    <DictateButton
                      value={replyDraft}
                      onChange={setReplyDraft}
                      compact
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-espresso/55">
                    {replyDraft.length}/4000
                  </span>
                  <button
                    type="submit"
                    disabled={!replyDraft.trim() || submitting}
                    className="px-5 py-2 rounded-lg bg-terracotta text-white hover:bg-terracotta-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Post reply
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
