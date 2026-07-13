'use client';

/**
 * Reusable moderation report dialog.
 *
 * Drop-in component callers wrap around any "Report this" affordance. The
 * dialog renders a category picker + description textarea, validates against
 * the same enum the backend (`reports.py`) enforces, and POSTs to
 * `/api/v1/students/reports`. The endpoint is open to any authenticated
 * user, not just students — the URL just lives under the students prefix
 * for historical reasons.
 *
 * Caller passes one of `reportedUserId`, `reportedPostId`, or
 * `reportedMessageId`. Backend rejects requests with none of them.
 */

import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';

const CATEGORIES = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate_speech', label: 'Hate speech' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'spam', label: 'Spam' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'other', label: 'Other concern' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  reportedUserId?: string;
  reportedPostId?: string;
  reportedMessageId?: string;
  /** Display name shown in the "Report X" header — purely cosmetic. */
  subjectLabel?: string;
}

export function ReportDialog({
  open,
  onClose,
  reportedUserId,
  reportedPostId,
  reportedMessageId,
  subjectLabel,
}: Props) {
  const [category, setCategory] = useState('harassment');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const reset = () => {
    setCategory('harassment');
    setDescription('');
    setError(null);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 5) {
      setError('Please describe the issue (at least 5 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/students/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          description: description.trim(),
          reported_user_id: reportedUserId,
          reported_post_id: reportedPostId,
          reported_message_id: reportedMessageId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed (${res.status})`);
      }
      setDone(true);
      setTimeout(handleClose, 1800);
    } catch (err: any) {
      setError(err?.message || 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-espresso/55 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report content"
        className="bg-cream-50 rounded-3xl border-2 border-espresso shadow-kid-lg w-full max-w-md"
      >
        <div className="bg-espresso text-cream px-5 py-4 rounded-t-3xl flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 text-mustard shrink-0" />
            <h2 className="text-base font-bold truncate">
              {subjectLabel ? `Report ${subjectLabel}` : 'Submit a report'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-cream/65 hover:text-cream rounded-full p-1 hover:bg-cream/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="w-14 h-14 text-forest-300 mx-auto mb-3" />
            <h3 className="font-display text-xl font-bold text-espresso mb-1">Report sent</h3>
            <p className="text-sm text-espresso/70">
              Our moderators will review it shortly. Thanks for keeping SkillHub safe.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-espresso/65 mb-2">
                What's wrong?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer text-sm ${
                      category === c.id
                        ? 'bg-terracotta-50 border-terracotta-400 text-espresso font-semibold'
                        : 'bg-cream-100 border-espresso/10 text-espresso/75 hover:border-espresso/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-category"
                      value={c.id}
                      checked={category === c.id}
                      onChange={() => setCategory(c.id)}
                      className="accent-terracotta"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="report-description" className="block text-xs font-bold uppercase tracking-wide text-espresso/65 mb-2">
                Tell us more
              </label>
              <textarea
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What happened? Add as much detail as you can."
                className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none resize-none"
                required
                minLength={5}
                maxLength={4000}
              />
              <p className="text-[11px] text-espresso/55 mt-1">
                Reports are confidential — the reported user doesn't see who flagged them.
              </p>
            </div>

            {error && (
              <div className="bg-coral-50 border-2 border-coral-200 text-coral-400 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t-2 border-espresso/10">
              <button type="button" onClick={handleClose} className="btn-kid-ghost text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-kid-primary text-sm disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  'Submit report'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
