'use client';

/**
 * Phase L3 — Admin: pending teacher verification queue.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CheckCircle2, XCircle, User } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface PendingTeacher {
  teacher_profile_id: string;
  user_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  qualifications?: string;
  experience_years?: number;
  bio?: string;
  created_at?: string;
}

export default function AdminTeacherQueuePage() {
  const [teachers, setTeachers] = useState<PendingTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiClient.listPendingTeachers();
      setTeachers(res.teachers || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await apiClient.verifyTeacher(id, { approve, notes: notes[id] || undefined });
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader title="Teacher" accent="verifications" />
        <p className="text-sm text-espresso/70">
          Review pending teacher accounts. Approval unlocks course publishing.
        </p>

        {error && (
          <Card className="border-coral/30 bg-coral/10">
            <CardContent className="p-3 text-sm text-coral">{error}</CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-espresso/55">Loading...</p>
        ) : teachers.length === 0 ? (
          <Card className="p-10 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" aria-hidden />
            <p className="text-espresso/70">No pending teachers.</p>
          </Card>
        ) : (
          teachers.map((t) => {
            const name =
              `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.email || 'Teacher';
            return (
              <Card key={t.teacher_profile_id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    {t.avatar_url ? (
                      <img
                        src={t.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-cream-300 flex items-center justify-center">
                        <User className="h-5 w-5 text-espresso/55" aria-hidden />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{name}</h3>
                      <p className="text-xs text-espresso/55">{t.email}</p>
                      <p className="text-xs text-espresso/55">
                        {t.experience_years ?? 0} yrs experience
                      </p>
                    </div>
                    <Badge variant="outline">Pending</Badge>
                  </div>
                  {t.qualifications && (
                    <p className="text-sm text-espresso mb-2">
                      <strong>Qualifications:</strong> {t.qualifications}
                    </p>
                  )}
                  {t.bio && (
                    <p className="text-sm text-espresso mb-3 whitespace-pre-wrap">{t.bio}</p>
                  )}
                  <Textarea
                    rows={2}
                    value={notes[t.teacher_profile_id] || ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [t.teacher_profile_id]: e.target.value }))
                    }
                    placeholder="Notes (optional, sent to the teacher on rejection)"
                  />
                  <div className="flex gap-2 mt-3 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => decide(t.teacher_profile_id, false)}
                      disabled={busyId === t.teacher_profile_id}
                    >
                      <XCircle className="h-4 w-4 mr-1 text-coral" aria-hidden />
                      Reject
                    </Button>
                    <Button
                      onClick={() => decide(t.teacher_profile_id, true)}
                      disabled={busyId === t.teacher_profile_id}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden />
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
