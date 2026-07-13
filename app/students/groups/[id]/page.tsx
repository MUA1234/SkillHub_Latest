'use client';

/**
 * Phase K2 — Learning group detail page.
 *
 * Shows the group card + member list + leave button. Group posts and
 * scheduled-sessions are deferred to a future iteration (the backend
 * tables exist but the endpoints aren't built).
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, LogOut, ArrowLeft, User as UserIcon } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await apiClient.getGroup(id);
      setData(r);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const leave = async () => {
    if (!id) return;
    if (!confirm('Leave this group?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.leaveGroup(id);
      router.push('/students/groups');
    } catch (e: any) {
      setError(e?.message || 'Leave failed');
      setBusy(false);
    }
  };

  const join = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.joinGroup(id);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Join failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return <div className="p-8 text-sm text-espresso/55">Loading...</div>;
  }
  const g = data.group;

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => router.push('/students/groups')}
          className="text-sm text-espresso/70 hover:text-espresso flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to groups
        </button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{g.name}</CardTitle>
                {g.description && (
                  <p className="text-sm text-espresso/70 mt-2 whitespace-pre-wrap">
                    {g.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant="outline">{g.group_type || 'group'}</Badge>
                <span className="text-xs text-espresso/55">
                  {g.current_members || 0}
                  {g.max_members ? `/${g.max_members}` : ''} members
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-3 p-2 text-sm text-coral bg-coral/10 border border-coral/30 rounded">
                {error}
              </div>
            )}
            {data.is_member ? (
              data.my_role === 'admin' ? (
                <p className="text-xs text-espresso/55">
                  You're the admin of this group. Transfer admin before leaving.
                </p>
              ) : (
                <Button variant="outline" onClick={leave} disabled={busy}>
                  <LogOut className="h-4 w-4 mr-1" />
                  Leave group
                </Button>
              )
            ) : (
              <Button onClick={join} disabled={busy}>
                Join this group
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-terracotta" aria-hidden />
              Members ({data.members?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {(data.members || []).map((m: any) => (
                <div key={m.user_id} className="flex items-center gap-3 py-2">
                  {m.avatar_url ? (
                    <img
                      src={m.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-cream-300 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-espresso/55" aria-hidden />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-espresso/55">
                      {m.role === 'admin' ? 'Admin' : 'Member'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
