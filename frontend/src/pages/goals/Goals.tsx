import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { goalsApi, portfoliosApi } from '../../api/endpoints';
import type { Goal, GoalPayload, RiskProfile } from '../../api/types';
import { formatMoney, formatPercent, parseMoney } from '../../api/types';
import { Badge, Button, Card, EmptyState, Input, Modal, ProgressBar, SkeletonCard } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';
import { format } from 'date-fns';

interface GoalForm {
  name: string;
  target_amount: string;
  target_date: string;
  starting_amount: string;
  monthly_contribution: string;
  expected_return_pct: string;
  risk_level: RiskProfile;
  portfolio: string;
}

const emptyForm = (): GoalForm => ({
  name: '',
  target_amount: '',
  target_date: format(new Date(Date.now() + 365 * 24 * 3600 * 1000), 'yyyy-MM-dd'),
  starting_amount: '',
  monthly_contribution: '',
  expected_return_pct: '7',
  risk_level: 'moderate',
  portfolio: '',
});

export default function GoalsPage() {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const goals = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list });
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalForm>(emptyForm());

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), portfolio: portfolios.data?.[0]?.id ?? '' });
    setModalOpen(true);
  };

  const openEdit = (g: Goal) => {
    setEditing(g);
    setForm({
      name: g.name,
      target_amount: g.target_amount,
      target_date: g.target_date,
      starting_amount: g.starting_amount,
      monthly_contribution: g.monthly_contribution,
      expected_return_pct: g.expected_return_pct,
      risk_level: g.risk_level,
      portfolio: g.portfolio ?? '',
    });
    setModalOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: GoalPayload = {
        name: form.name,
        target_amount: Number(form.target_amount),
        target_date: form.target_date,
        starting_amount: form.starting_amount ? Number(form.starting_amount) : undefined,
        monthly_contribution: form.monthly_contribution ? Number(form.monthly_contribution) : undefined,
        expected_return_pct: form.expected_return_pct ? Number(form.expected_return_pct) : undefined,
        risk_level: form.risk_level,
        portfolio: form.portfolio || null,
      };
      if (editing) return goalsApi.patch(editing.id, payload);
      return goalsApi.create(payload);
    },
    onSuccess: (g) => {
      toastSuccess(editing ? 'Goal updated' : 'Goal created');
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      if (editing) navigate(`/goals/${g.id}`);
    },
    onError: (err) => toastError('Save failed', apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => goalsApi.remove(id),
    onSuccess: () => {
      toastSuccess('Goal deleted');
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
  });

  const riskTone = (r: RiskProfile) => (r === 'aggressive' ? 'danger' : r === 'conservative' ? 'success' : 'warning');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="page-sub">Plan for retirement, a home, education — and see if you’re on track.</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={16} />}>
          New goal
        </Button>
      </div>

      {goals.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} rows={5} />
          ))}
        </div>
      ) : (goals.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No goals yet"
            message="Define a target amount and date, then track your progress with projections and contributions."
            icon={<Target size={22} />}
            action={<Button onClick={openCreate} icon={<Plus size={16} />}>Create your first goal</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(goals.data ?? []).map((g) => {
            const pct = parseMoney(g.target_amount) > 0 ? (parseMoney(g.starting_amount) / parseMoney(g.target_amount)) * 100 : 0;
            return (
              <div key={g.id} className="card card-pad flex flex-col">
                <Link to={`/goals/${g.id}`} className="block flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{g.name}</h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        Target {format(new Date(`${g.target_date}T00:00:00`), 'MMM yyyy')}
                      </p>
                    </div>
                    <Badge tone={riskTone(g.risk_level)}>{g.risk_level}</Badge>
                  </div>
                  <p className="text-xl font-bold tracking-tight">{formatMoney(g.target_amount, currency, locale)}</p>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--muted)' }}>{formatMoney(g.starting_amount, currency, locale)} saved</span>
                      <span className="font-semibold">{Math.min(100, pct).toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={pct} color={pct >= 100 ? 'var(--success)' : undefined} />
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                    {formatPercent(g.expected_return_pct, 1)} expected · {formatMoney(g.monthly_contribution, currency, locale)}/mo
                  </p>
                </Link>
                <div className="flex justify-end gap-1 border-t mt-3 pt-2" style={{ borderColor: 'var(--border)' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm !px-2"
                    onClick={() => {
                      if (window.confirm(`Delete goal “${g.name}”?`)) remove.mutate(g.id);
                    }}
                    aria-label={`Delete goal ${g.name}`}
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit goal' : 'Create goal'}
        subtitle="Projections use the expected return and monthly contribution"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim() || !form.target_amount || !form.target_date}>
              {editing ? 'Save changes' : 'Create goal'}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input label="Goal name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Retirement, House down payment" className="sm:col-span-2" autoFocus />
          <Input label="Target amount" type="number" step="any" min="0" required value={form.target_amount} onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))} placeholder="e.g. 500000" />
          <Input label="Target date" type="date" required value={form.target_date} onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))} />
          <Input label="Starting amount" type="number" step="any" min="0" value={form.starting_amount} onChange={(e) => setForm((f) => ({ ...f, starting_amount: e.target.value }))} placeholder="e.g. 10000" />
          <Input label="Monthly contribution" type="number" step="any" min="0" value={form.monthly_contribution} onChange={(e) => setForm((f) => ({ ...f, monthly_contribution: e.target.value }))} placeholder="e.g. 500" />
          <div>
            <label className="field-label">Expected return (%/yr)</label>
            <Input type="number" step="0.5" min="-10" max="30" value={form.expected_return_pct} onChange={(e) => setForm((f) => ({ ...f, expected_return_pct: e.target.value }))} placeholder="e.g. 7" />
          </div>
          <div>
            <label className="field-label">Risk level</label>
            <select className="select" value={form.risk_level} onChange={(e) => setForm((f) => ({ ...f, risk_level: e.target.value as RiskProfile }))}>
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Linked portfolio (optional)</label>
            <select className="select" value={form.portfolio} onChange={(e) => setForm((f) => ({ ...f, portfolio: e.target.value }))}>
              <option value="">None — track manually</option>
              {(portfolios.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="field-hint">Portfolio contributions are auto-counted toward this goal.</p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
