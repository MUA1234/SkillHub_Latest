'use client';

/**
 * Phase L5 — Admin: teacher payout queue.
 *
 * Admins create a payout for a teacher (the demo flow has no real money
 * to route automatically), approve it, then mark it paid with the bank
 * reference once the transfer happens out-of-band.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Banknote, CheckCircle2, XCircle, Send } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface Payout {
  id: string;
  teacher_profile_id: string;
  teacher_name?: string;
  teacher_email?: string;
  amount_lkr: number;
  currency?: string;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  period_start?: string;
  period_end?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  bank_reference?: string;
  admin_notes?: string;
  requested_at?: string;
  approved_at?: string;
  paid_at?: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-mustard/20 text-amber-800',
  approved: 'bg-terracotta/15 text-terracotta-500',
  paid: 'bg-forest/15 text-forest-500',
  cancelled: 'bg-cream-300 text-espresso',
};

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    teacher_profile_id: '',
    amount_lkr: '',
    period_start: '',
    period_end: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_holder: '',
    admin_notes: '',
  });

  const [refInput, setRefInput] = useState<Record<string, string>>({});
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});

  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiClient.listAdminPayouts(filter || undefined);
      setPayouts(res.payouts || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [filter]);

  const handleCreate = async () => {
    setError(null);
    if (!form.teacher_profile_id.trim() || !form.amount_lkr) {
      setError('Teacher profile id and amount are required.');
      return;
    }
    try {
      await apiClient.createAdminPayout({
        teacher_profile_id: form.teacher_profile_id.trim(),
        amount_lkr: Number(form.amount_lkr),
        period_start: form.period_start || undefined,
        period_end: form.period_end || undefined,
        bank_name: form.bank_name || undefined,
        bank_account_number: form.bank_account_number || undefined,
        bank_account_holder: form.bank_account_holder || undefined,
        admin_notes: form.admin_notes || undefined,
      });
      setCreateOpen(false);
      setForm({
        teacher_profile_id: '',
        amount_lkr: '',
        period_start: '',
        period_end: '',
        bank_name: '',
        bank_account_number: '',
        bank_account_holder: '',
        admin_notes: '',
      });
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Failed to create payout.');
    }
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await apiClient.approveAdminPayout(id, notesInput[id] || undefined);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Approve failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkPaid = async (id: string) => {
    const ref = (refInput[id] || '').trim();
    if (!ref) {
      setError('Bank reference is required to mark a payout paid.');
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await apiClient.markAdminPayoutPaid(id, {
        bank_reference: ref,
        admin_notes: notesInput[id] || undefined,
      });
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Mark paid failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this payout?')) return;
    setBusyId(id);
    setError(null);
    try {
      await apiClient.cancelAdminPayout(id, notesInput[id] || undefined);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Cancel failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Banknote className="w-7 h-7 text-forest" /> Teacher payouts
        </h1>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button onClick={() => setCreateOpen((v) => !v)}>
            {createOpen ? 'Close' : 'New payout'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-coral/10 text-coral border border-coral/30 rounded p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {createOpen && (
        <Card className="mb-6">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-espresso/70">Teacher profile id</label>
              <Input
                value={form.teacher_profile_id}
                onChange={(e) =>
                  setForm({ ...form, teacher_profile_id: e.target.value })
                }
                placeholder="uuid…"
              />
            </div>
            <div>
              <label className="text-xs text-espresso/70">Amount (LKR)</label>
              <Input
                type="number"
                value={form.amount_lkr}
                onChange={(e) => setForm({ ...form, amount_lkr: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-espresso/70">Period start</label>
              <Input
                type="date"
                value={form.period_start}
                onChange={(e) =>
                  setForm({ ...form, period_start: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-espresso/70">Period end</label>
              <Input
                type="date"
                value={form.period_end}
                onChange={(e) => setForm({ ...form, period_end: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-espresso/70">Bank</label>
              <Input
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-espresso/70">Account number</label>
              <Input
                value={form.bank_account_number}
                onChange={(e) =>
                  setForm({ ...form, bank_account_number: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-espresso/70">Account holder</label>
              <Input
                value={form.bank_account_holder}
                onChange={(e) =>
                  setForm({ ...form, bank_account_holder: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-espresso/70">Admin notes</label>
              <Textarea
                value={form.admin_notes}
                onChange={(e) =>
                  setForm({ ...form, admin_notes: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={handleCreate}>Queue payout</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : payouts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-espresso/70">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-2" />
            No payouts in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payouts.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {p.teacher_name || p.teacher_email || p.teacher_profile_id}
                    </div>
                    <div className="text-sm text-espresso/70">
                      {p.teacher_email}
                    </div>
                    <div className="text-lg mt-1">
                      {formatCurrency(p.amount_lkr || 0, {
                        currency: p.currency || 'LKR',
                      })}
                    </div>
                    {(p.period_start || p.period_end) && (
                      <div className="text-xs text-espresso/55 mt-1">
                        Period: {p.period_start || '—'} → {p.period_end || '—'}
                      </div>
                    )}
                    {p.bank_name && (
                      <div className="text-xs text-espresso/55 mt-1">
                        {p.bank_name}{' '}
                        {p.bank_account_number ? `· ${p.bank_account_number}` : ''}{' '}
                        {p.bank_account_holder ? `(${p.bank_account_holder})` : ''}
                      </div>
                    )}
                    {p.bank_reference && (
                      <div className="text-xs text-espresso mt-1">
                        Bank ref: <span className="font-mono">{p.bank_reference}</span>
                      </div>
                    )}
                    {p.admin_notes && (
                      <div className="text-xs text-espresso mt-1">
                        Notes: {p.admin_notes}
                      </div>
                    )}
                  </div>
                  <Badge className={STATUS_BADGE[p.status] || ''}>
                    {p.status}
                  </Badge>
                </div>

                {p.status !== 'paid' && p.status !== 'cancelled' && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="Bank reference (required to mark paid)"
                      value={refInput[p.id] || ''}
                      onChange={(e) =>
                        setRefInput({ ...refInput, [p.id]: e.target.value })
                      }
                    />
                    <Textarea
                      placeholder="Notes"
                      rows={2}
                      value={notesInput[p.id] || ''}
                      onChange={(e) =>
                        setNotesInput({ ...notesInput, [p.id]: e.target.value })
                      }
                    />
                    <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
                      {p.status === 'pending' && (
                        <Button
                          variant="outline"
                          onClick={() => handleApprove(p.id)}
                          disabled={busyId === p.id}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                        </Button>
                      )}
                      <Button
                        onClick={() => handleMarkPaid(p.id)}
                        disabled={busyId === p.id}
                      >
                        <Send className="w-4 h-4 mr-1" /> Mark paid
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleCancel(p.id)}
                        disabled={busyId === p.id}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
