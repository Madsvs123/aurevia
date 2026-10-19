import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { TargetAllocationItem } from '../../../api/types';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, SkeletonCard } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';
import { useRebalancing } from '../../../hooks/useRebalancing';
import { apiErrorMessage } from '../../../api/client';
import { toastError, toastSuccess } from '../../../store/toast';

interface RebalancingTabProps {
  portfolioId: string;
}

const KINDS = ['stock', 'etf', 'bond', 'fund', 'cash', 'crypto', 'private', 'other'];

interface TargetRow {
  id?: string;
  label: string;
  kind: string;
  target_weight_pct: string;
  current_weight_pct: string;
}

function toRow(item: TargetAllocationItem): TargetRow {
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    target_weight_pct: item.target_weight_pct,
    current_weight_pct: item.current_weight_pct,
  };
}

const actionTone = (a: string) => (a === 'buy' ? 'success' : a === 'sell' ? 'danger' : 'muted');

export default function RebalancingTab({ portfolioId }: RebalancingTabProps) {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';

  const { targets, suggestions, saveTargets, apply, enableSuggestions } = useRebalancing(portfolioId);

  const [rows, setRows] = useState<TargetRow[]>([]);
  const [driftThreshold, setDriftThreshold] = useState('5');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (targets.data && !loaded) {
      setRows(targets.data.items.map(toRow));
      setDriftThreshold(targets.data.drift_threshold_pct ?? '5');
      setLoaded(true);
    }
  }, [targets.data, loaded]);

  const saveTargetsMutation = saveTargets;

  const save = async () => {
    try {
      await saveTargetsMutation.mutateAsync({
        items: rows.map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind,
          target_weight_pct: r.target_weight_pct,
          current_weight_pct: r.current_weight_pct,
        })),
        drift_threshold_pct: driftThreshold,
      });
      toastSuccess('Targets saved');
    } catch (err) {
      toastError('Could not save targets', apiErrorMessage(err));
    }
  };

  const applyRebalance = async () => {
    try {
      await apply.mutateAsync({
        items: (suggestions.data?.suggestions ?? [])
          .filter((s) => s.action !== 'hold')
          .map((s) => ({ label: s.label, action: s.action, est_amount: s.est_amount })),
      });
      toastSuccess('Rebalance applied', 'Holdings and analytics have been updated.');
    } catch (err) {
      toastError('Could not apply rebalance', apiErrorMessage(err));
    }
  };

  const updateRow = (index: number, patch: Partial<TargetRow>) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  if (targets.isLoading) return <SkeletonCard rows={6} />;

  const suggestionList = (suggestions.data?.suggestions ?? []).filter((s) => s.action === 'hold');
  const driftPct = suggestions.data?.drift_pct;

  return (
    <div className="space-y-5">
      {/* Target allocation editor */}
      <Card>
        <CardHeader
          title="Target allocation"
          subtitle="Set target weights per asset class; drift beyond the threshold triggers rebalancing"
          action={
            <Button size="sm" onClick={() => void save()} loading={saveTargetsMutation.isPending} disabled={rows.length === 0} icon={<Save size={14} />}>
              Save targets
            </Button>
          }
        />
        <div className="space-y-2.5">
          {rows.length === 0 ? (
            <EmptyState
              title="No targets yet"
              message="Define target weights to enable drift detection and rebalance suggestions."
              action={
                <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, { label: '', kind: 'stock', target_weight_pct: '', current_weight_pct: '' }])} icon={<Plus size={14} />}>
                  Add target
                </Button>
              }
              compact
            />
          ) : (
            <>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <Input value={r.label} onChange={(e) => updateRow(i, { label: e.target.value })} placeholder="Label, e.g. US Equities" aria-label="Target label" />
                  </div>
                  <div className="col-span-3">
                    <select className="select" value={r.kind} onChange={(e) => updateRow(i, { kind: e.target.value })} aria-label="Asset class">
                      {KINDS.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="any" min="0" value={r.target_weight_pct} onChange={(e) => updateRow(i, { target_weight_pct: e.target.value })} placeholder="%" aria-label="Target weight %" />
                  </div>
                  <div className="col-span-2 text-xs" style={{ color: 'var(--muted)' }}>
                    {r.current_weight_pct !== '' ? `now ${parseMoney(r.current_weight_pct).toFixed(1)}%` : '—'}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      className="btn btn-ghost btn-sm !px-1.5"
                      onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      aria-label="Remove target"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, { label: '', kind: 'stock', target_weight_pct: '', current_weight_pct: '' }])} icon={<Plus size={13} />}>
                  Add target
                </Button>
                <div className="flex items-center gap-2">
                  <label className="field-label !mb-0">Drift threshold %</label>
                  <Input type="number" step="any" min="0" className="!w-20" value={driftThreshold} onChange={(e) => setDriftThreshold(e.target.value)} aria-label="Drift threshold percent" />
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Suggestions */}
      <Card>
        <CardHeader
          title="Rebalance suggestions"
          subtitle="Generated from current weights vs targets"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={enableSuggestions}
              loading={suggestions.isFetching}
              icon={<RefreshCw size={13} />}
            >
              Get suggestions
            </Button>
          }
        />
        {suggestions.isLoading ? (
          <SkeletonCard rows={4} />
        ) : !suggestions.data || suggestionList.length === 0 ? (
          <EmptyState
            title="No suggestions yet"
            message="Save your target allocation, then fetch suggestions to see what to buy or sell."
            compact
          />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone={parseMoney(driftPct) > parseMoney(targets.data?.drift_threshold_pct) ? 'danger' : 'success'}>
                Drift {driftPct !== undefined ? formatPercent(driftPct) : '—'}
              </Badge>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Threshold {parseMoney(targets.data?.drift_threshold_pct).toFixed(1)}%
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Allocation</th>
                    <th className="text-right">Current</th>
                    <th className="text-right">Target</th>
                    <th>Action</th>
                    <th className="text-right">Est. amount</th>
                    <th className="text-right">Est. quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestionList.map((s) => (
                    <tr key={s.label}>
                      <td>
                        <p className="font-semibold">{s.label}</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{s.kind}</p>
                      </td>
                      <td className="text-right">{parseMoney(s.current_weight_pct).toFixed(1)}%</td>
                      <td className="text-right">{parseMoney(s.target_weight_pct).toFixed(1)}%</td>
                      <td>
                        <Badge tone={actionTone(s.action)}>{s.action}</Badge>
                      </td>
                      <td className={`text-right ${signClass(s.est_amount)}`}>{formatMoney(s.est_amount, currency, locale)}</td>
                      <td className="text-right">{s.est_quantity !== '' ? parseMoney(s.est_quantity).toLocaleString(locale, { maximumFractionDigits: 4 }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end pt-3">
              <Button onClick={() => void applyRebalance()} loading={apply.isPending} disabled={suggestionList.filter((s) => s.action !== 'hold').length === 0}>
                Apply rebalance
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
