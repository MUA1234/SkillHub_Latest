'use client';

/**
 * Phase K2 — Student: learning groups browse + create.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Search, X, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

interface Group {
  id: string;
  name: string;
  description?: string;
  group_type?: string;
  level?: string;
  current_members?: number;
  max_members?: number;
  language?: string;
  tags?: string[];
  is_member?: boolean;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [mine, setMine] = useState<Group[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    group_type: 'study',
    level: '',
    max_members: 20,
  });
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [all, my] = await Promise.all([
        apiClient.listGroups(q || undefined),
        apiClient.listMyGroups(),
      ]);
      setGroups(all.groups || []);
      setMine(my.groups || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createGroup = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.createGroup(form);
      setModalOpen(false);
      setForm({ name: '', description: '', group_type: 'study', level: '', max_members: 20 });
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const join = async (id: string) => {
    try {
      await apiClient.joinGroup(id);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Join failed');
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-terracotta" aria-hidden />
            <div>
              <PageHeader title="Learning" accent="groups" />
              <p className="text-sm text-espresso/70">
                Join study and peer-support groups with classmates.
              </p>
            </div>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New group
          </Button>
        </div>

        {error && (
          <Card className="border-coral/30 bg-coral/10">
            <CardContent className="p-3 text-sm text-coral">{error}</CardContent>
          </Card>
        )}

        {mine.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Your groups</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mine.map((g) => (
                <GroupCard key={g.id} g={g} mine />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold mb-2">Browse all groups</h2>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-espresso/45" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') reload();
                }}
                placeholder="Search by name or description"
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => reload()}>
              Search
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-espresso/55">Loading...</p>
          ) : groups.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-espresso/70">
                No groups yet. Create one to get started.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groups.map((g) => (
                <GroupCard key={g.id} g={g} onJoin={() => join(g.id)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-group-title"
        >
          <div className="bg-cream-50 rounded-lg max-w-md w-full p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 id="new-group-title" className="font-semibold text-lg">
                New learning group
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="p-1 hover:bg-cream-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <select
                    value={form.group_type}
                    onChange={(e) => setForm({ ...form, group_type: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="study">Study</option>
                    <option value="project">Project</option>
                    <option value="peer_support">Peer support</option>
                  </select>
                </div>
                <div>
                  <Label>Max members</Label>
                  <Input
                    type="number"
                    min={2}
                    value={form.max_members}
                    onChange={(e) =>
                      setForm({ ...form, max_members: parseInt(e.target.value || '20', 10) })
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={createGroup} disabled={saving || !form.name.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}

function GroupCard({
  g,
  mine,
  onJoin,
}: {
  g: Group;
  mine?: boolean;
  onJoin?: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{g.name}</h3>
            {g.description && (
              <p className="text-sm text-espresso/70 line-clamp-2 mt-1">{g.description}</p>
            )}
          </div>
          {g.is_member || mine ? (
            <Badge variant="outline" className="bg-forest/10 border-forest/30 text-forest-500">
              Member
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-espresso/55">
            {g.current_members || 0}
            {g.max_members ? `/${g.max_members}` : ''} members · {g.group_type || 'group'}
          </div>
          {mine || g.is_member ? (
            <Link href={`/students/groups/${g.id}`}>
              <Button variant="outline" size="sm">
                Open
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" onClick={onJoin}>
              Join
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
