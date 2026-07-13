'use client';

/**
 * Phase L4 — Admin: moderation reports queue.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Flag, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface ReportRow {
  id: string;
  reporter_id?: string;
  reported_user_id?: string;
  reported_content_id?: string;
  content_type?: string;
  reason?: string;
  description?: string;
  status?: string;
  created_at?: string;
}

const ACTIONS = [
  { id: 'warn', label: 'Warn user' },
  { id: 'hide', label: 'Hide content' },
  { id: 'suspend', label: 'Suspend user' },
  { id: 'dismiss', label: 'Dismiss' },
];

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [action, setAction] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiClient.listOpenReports();
      setReports(res.reports || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const resolve = async (id: string) => {
    const act = action[id] || 'dismiss';
    setBusyId(id);
    setError(null);
    try {
      await apiClient.resolveReport(id, { action: act, admin_notes: notes[id] || undefined });
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
        <PageHeader title="User" accent="reports" />
        <p className="text-sm text-espresso/70">
          Review flagged content. Resolution actions are logged with admin notes.
        </p>

        {error && (
          <Card className="border-coral/30 bg-coral/10">
            <CardContent className="p-3 text-sm text-coral">{error}</CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-espresso/55">Loading...</p>
        ) : reports.length === 0 ? (
          <Card className="p-10 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" aria-hidden />
            <p className="text-espresso/70">No open reports.</p>
          </Card>
        ) : (
          reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Flag className="h-5 w-5 text-red-500" aria-hidden />
                    <h3 className="font-semibold">
                      {r.content_type || 'Report'} · {r.reason || 'unspecified'}
                    </h3>
                  </div>
                  <Badge variant="outline">{r.status || 'open'}</Badge>
                </div>
                {r.description && (
                  <p className="text-sm text-espresso mb-3 whitespace-pre-wrap">{r.description}</p>
                )}
                <div className="text-xs text-espresso/55 mb-3 space-y-0.5">
                  {r.reporter_id && <div>Reporter: {r.reporter_id}</div>}
                  {r.reported_user_id && <div>Reported user: {r.reported_user_id}</div>}
                  {r.reported_content_id && (
                    <div>Reported content: {r.reported_content_id}</div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-espresso/70 mb-1">
                      Action
                    </label>
                    <select
                      value={action[r.id] || 'dismiss'}
                      onChange={(e) => setAction((a) => ({ ...a, [r.id]: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-espresso/70 mb-1">
                      Admin notes
                    </label>
                    <Textarea
                      rows={1}
                      value={notes[r.id] || ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Reasoning / context"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <Button onClick={() => resolve(r.id)} disabled={busyId === r.id}>
                    <AlertCircle className="h-4 w-4 mr-1" aria-hidden />
                    Resolve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
