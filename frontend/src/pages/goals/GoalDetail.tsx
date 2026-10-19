import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Plus, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { goalsApi } from '../../api/endpoints';
import type { GoalContribution, GoalScenarioSnapshot } from '../../api/types';
import { formatMoney, formatPercent, parseMoney } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, ProgressBar, SkeletonCard, StatCard } from '../../components/ui';
import { GoalProjectionArea, type GoalProjectionPoint } from '../../components/charts';
import { useAuth } from '../../hooks/useAuth';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const queryClient = useQueryClient();

  const goal = useQuery({
    queryKey: ['goal', id],
    queryFn: () => goalsApi.detail(id as string),
    enabled: Boolean(id),
  });

  const progress = useQuery({
    queryKey: ['goal', id, 'progress'],
    queryFn: () => goalsApi.progress(id as string),
    enabled: Boolean(id),
  });

  const contributions = useQuery({
    queryKey: ['goal', id, 'contributions'],
    queryFn: () => goalsApi.contributions(id as string),
    enabled: Boolean(id),
  });

  const [contribOpen, setContribOpen] = useState(false);
  const [contribForm, setContribForm] = useState({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), note: '' });

  const addContribution = useMutation({
    mutationFn: () =>
      goalsApi.addContribution(id as string, {
        amount: Number(contribForm.amount),
        date: contribForm.date,
        note: contribForm.note || undefined,
      }),
    onSuccess: () => {
      toastSuccess('Contribution added');
      setContribOpen(false);
      setContribForm({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), note: '' });
      void queryClient.invalidateQueries({ queryKey: ['goal', id] });
    },
    onError: (err) => toastError('Could not add contribution', apiErrorMessage(err)),
  });

  const g = goal.data;
  const p = progress.data;
  const contribList = contributions.data ?? [];

  const chartData: GoalProjectionPoint[] = (p?.series ?? []).map((s) => ({
    label: format(new Date(`${s.month}-01T00:00:00`), 'MMM yy'),
    value: parseMoney(s.value),
    projected: parseMoney(s.projected),
  }));

  if (goal.isLoading) return <SkeletonCard rows={6} />;

  if (!g) {
    return (
      <Card>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Goal not found.</p>
        <Link to="/goals" className="link text-sm mt-2 inline-block">Back to goals</Link>
      </Card>
    );
  }

  const pct = p ? parseMoney(p.progress_pct) : parseMoney(g.starting_amount) / Math.max(parseMoney(g.target_amount), 1) * 100;

  return (
    <div className="space-y-5">
      <Link to="/goals" className="link text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> All goals
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{g.name}</h1>
            {g.is_achieved ? <Badge tone="success"><CheckCircle2 size={12} /> Achieved</Badge> : null}
            {p && !p.on_track && !g.is_achieved ? (
              <Badge tone="warning"><TriangleAlert size={12} /> Off track</Badge>
            ) : null}
            {p && p.on_track && !g.is_achieved ? <Badge tone="info">On track</Badge> : null}
          </div>
          <p className="page-sub">
            Target {formatMoney(g.target_amount, currency, locale)} by{' '}
            {format(new Date(`${g.target_date}T00:00:00`), 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setContribOpen(true)} icon={<Plus size={14} />}>
            Add contribution
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Current value" value={p ? formatMoney(p.current_value, currency, locale) : undefined} loading={progress.isLoading} delta={formatPercent(pct)} deltaLabel="progress" currency={currency} />
        <StatCard label="Target amount" value={formatMoney(g.target_amount, currency, locale)} currency={currency} />
        <StatCard label="Shortfall" value={p ? formatMoney(p.shortfall, currency, locale) : undefined} loading={progress.isLoading} hint={p && parseMoney(p.shortfall) <= 0 ? 'Goal fully funded 🎉' : undefined} currency={currency} />
        <StatCard
          label="Projected at target date"
          value={p ? formatMoney(p.projected_value_at_target, currency, locale) : undefined}
          loading={progress.isLoading}
          delta={p ? formatPercent((parseMoney(p.projected_value_at_target) / Math.max(parseMoney(g.target_amount), 1) - 1) * 100) : undefined}
          deltaLabel="vs target"
          currency={currency}
        />
      </div>

      <Card>
        <CardHeader
          title="Progress"
          subtitle={`${pct.toFixed(1)}% of target · ${p ? formatPercent(p.progress_pct) : ''}`}
          action={
            p ? (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <CalendarClock size={13} />
                {p.months_remaining} months remaining
                {p.projected_date ? ` · on pace for ${format(new Date(`${p.projected_date}T00:00:00`), 'MMM yyyy')}` : ''}
              </span>
            ) : undefined
          }
        />
        <ProgressBar value={pct} size="lg" color={pct >= 100 ? 'var(--success)' : p && !p.on_track ? 'var(--warning)' : undefined} className="mb-6" />
        <GoalProjectionArea
          data={chartData}
          loading={progress.isLoading}
          currency={currency}
          locale={locale}
          emptyTitle="No projection data"
          emptyMessage="Contributions and portfolio performance will build the projection."
        />
      </Card>

      {/* Scenario comparison */}
      <ScenarioSection
        goalId={g.id}
        defaultContribution={g.monthly_contribution}
        defaultReturn={g.expected_return_pct}
        currency={currency}
        locale={locale}
      />

      <Card>
        <CardHeader
          title={`Contributions (${contribList.length})`}
          subtitle="Manual contributions recorded against this goal"
          action={
            <Button size="sm" variant="secondary" onClick={() => setContribOpen(true)} icon={<Plus size={14} />}>
              Add
            </Button>
          }
        />
        {contributions.isLoading ? (
          <SkeletonCard rows={3} />
        ) : contribList.length === 0 ? (
          <EmptyState
            title="No contributions yet"
            message="Record the amounts you’ve put toward this goal."
            action={<Button variant="secondary" size="sm" onClick={() => setContribOpen(true)}>Add contribution</Button>}
            compact
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contribList.map((c: GoalContribution) => (
                  <tr key={c.id}>
                    <td>{format(new Date(`${c.date}T00:00:00`), 'MMM d, yyyy')}</td>
                    <td className="font-semibold">{formatMoney(c.amount, currency, locale)}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add contribution modal */}
      <Modal
        open={contribOpen}
        onClose={() => setContribOpen(false)}
        title="Add contribution"
        subtitle={`To “${g.name}”`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setContribOpen(false)}>Cancel</Button>
            <Button onClick={() => addContribution.mutate()} loading={addContribution.isPending} disabled={!contribForm.date}>
              Add
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addContribution.mutate();
          }}
        >
          <Input label="Amount" type="number" step="any" min="0" required value={contribForm.amount} onChange={(e) => setContribForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" autoFocus />
          <Input label="Date" type="date" required value={contribForm.date} onChange={(e) => setContribForm((f) => ({ ...f, date: e.target.value }))} />
          <Input label="Note (optional)" value={contribForm.note} onChange={(e) => setContribForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. January savings" />
        </form>
      </Modal>
    </div>
  );
}

/* ---------------- Scenario comparison ---------------- */

interface ScenarioSectionProps {
  goalId: string;
  defaultContribution: string;
  defaultReturn: string;
  currency: string;
  locale: string;
}

function SnapMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="text-sm font-bold mt-0.5">{value}</p>
    </div>
  );
}

function formatSnapshot(snapshot: GoalScenarioSnapshot, currency: string, locale: string): { projected_value: string; projected_date: string; shortfall: string; months_remaining: string } {
  return {
    projected_value:
      snapshot.projected_value != null && snapshot.projected_value !== ''
        ? formatMoney(snapshot.projected_value, currency, locale)
        : '—',
    projected_date: snapshot.projected_date ? format(new Date(`${snapshot.projected_date}T00:00:00`), 'MMM yyyy') : '—',
    shortfall:
      snapshot.shortfall != null && snapshot.shortfall !== '' ? formatMoney(snapshot.shortfall, currency, locale) : '—',
    months_remaining: snapshot.months_remaining != null ? String(snapshot.months_remaining) : '—',
  };
}

function ScenarioSection({ goalId, defaultContribution, defaultReturn, currency, locale }: ScenarioSectionProps) {
  const [run, setRun] = useState(false);
  const [form, setForm] = useState({ contribution: '', return_pct: '' });

  const scenarios = useQuery({
    queryKey: ['goal', goalId, 'scenarios', form],
    queryFn: () =>
      goalsApi.scenarios(goalId, {
        contribution: form.return_pct ? Number(form.return_pct) : undefined,
        return_pct: form.contribution ? Number(form.contribution) : undefined,
      }),
    enabled: !run,
  });

  const s = scenarios.data;

  return (
    <Card>
      <CardHeader
        title="What-if scenarios"
        subtitle="Compare the current plan against a different contribution or return assumption"
        action={
          <form
            className="flex flex-wrap gap-2 items-end justify-end"
            onSubmit={(e) => {
              e.preventDefault();
              setRun(true);
              void scenarios.refetch();
            }}
          >
            <div>
              <label className="field-label text-xs">Contribution</label>
              <Input type="number" step="any" min="0" className="!w-28" value={form.contribution} onChange={(e) => setForm((f) => ({ ...f, contribution: e.target.value }))} placeholder={defaultContribution || 'e.g. 500'} aria-label="Scenario contribution" />
            </div>
            <div>
              <label className="field-label text-xs">Return %</label>
              <Input type="number" step="0.1" className="!w-24" value={form.return_pct} onChange={(e) => setForm((f) => ({ ...f, return_pct: e.target.value }))} placeholder={defaultReturn || 'e.g. 9'} aria-label="Scenario return percent" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Compare</Button>
          </form>
        }
      />
      {scenarios.isLoading ? (
        <div className="skeleton h-32 rounded-xl" />
      ) : !s ? (
        <EmptyState
          title="No comparison yet"
          message="Set a contribution and expected return, then compare the outcome against your current plan."
          compact
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Baseline', snapshot: s.baseline, tone: 'muted' as const },
              { title: 'Scenario', snapshot: s.scenario, tone: 'primary' as const },
            ].map(({ title, snapshot }) => {
              const v = formatSnapshot(snapshot, currency, locale);
              return (
                <div key={title} className="rounded-xl p-4 space-y-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{title}</p>
                    <Badge tone={title === 'Baseline' ? 'muted' : 'primary'}>{title === 'Baseline' ? 'Current plan' : 'Adjusted'}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <SnapMetric label="Projected value" value={v.projected_value} />
                    <SnapMetric label="Projected date" value={v.projected_date} />
                    <SnapMetric label="Shortfall" value={v.shortfall} />
                    <SnapMetric label="Months remaining" value={v.months_remaining} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">Difference</p>
            <Badge tone="success">
              {s.difference.months_earlier !== null && s.difference.months_earlier !== undefined
                ? `${s.difference.months_earlier} month${s.difference.months_earlier === 1 ? '' : 's'} earlier`
                : 'Same timeline'}
            </Badge>
            <Badge tone="info">Extra value: {formatMoney(s.difference.extra_value, currency, locale)}</Badge>
            <Badge tone={parseMoney(s.difference.shortfall_reduction) >= 0 ? 'success' : 'warning'}>
              Shortfall reduction: {formatPercent(s.difference.shortfall_reduction)}
            </Badge>
          </div>
        </>
      )}
    </Card>
  );
}
