import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Bell, History, Plus, Star, Trash2 } from 'lucide-react';
import { watchlistsApi, watchlistItemsApi, watchlistAlertsApi, instrumentsApi } from '../../api/endpoints';
import type { WatchlistOverviewItem, WatchlistAlert, WatchlistItem, Instrument, AlertTrigger, SparklineItem } from '../../api/types';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Table, Tabs, Toggle, SkeletonCard } from '../../components/ui';
import { Sparkline } from '../../components/charts/Sparkline';
import { useAuth } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

interface AlertForm {
  instrument_symbol: string;
  watchlist: string;
  condition: 'above' | 'below' | 'change_pct';
  threshold: string;
  active: boolean;
}

const emptyAlertForm = (): AlertForm => ({
  instrument_symbol: '',
  watchlist: '',
  condition: 'above',
  threshold: '',
  active: true,
});

export default function WatchlistsPage() {
  const { profile } = useAuth();
  const locale = profile?.locale ?? 'en-US';
  const queryClient = useQueryClient();

  const overview = useQuery({ queryKey: ['watchlist', 'overview'], queryFn: watchlistsApi.overview });
  const watchlists = useQuery({ queryKey: ['watchlists'], queryFn: watchlistsApi.list });
  const alerts = useQuery({ queryKey: ['watchlist-alerts'], queryFn: watchlistAlertsApi.list });

  const [activeTab, setActiveTab] = useState('overview');
  const [addOpen, setAddOpen] = useState(false);
  const [addWatchlist, setAddWatchlist] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Instrument | null>(null);
  const [targetPrice, setTargetPrice] = useState('');
  const [notes, setNotes] = useState('');

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertForm, setAlertForm] = useState<AlertForm>(emptyAlertForm());
  const [triggersAlert, setTriggersAlert] = useState<WatchlistAlert | null>(null);

  const triggers = useQuery({
    queryKey: ['watchlist-alert', triggersAlert?.id, 'triggers'],
    queryFn: () => watchlistAlertsApi.triggers(triggersAlert?.id),
    enabled: Boolean(triggersAlert),
  });

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const instrumentResults = useQuery({
    queryKey: ['instruments', 'search', debouncedSearch],
    queryFn: () => instrumentsApi.list({ search: debouncedSearch }),
    enabled: debouncedSearch.trim().length >= 1,
  });

  const addItem = useMutation({
    mutationFn: () =>
      watchlistsApi.addItem(addWatchlist, {
        instrument: picked!.id,
        target_price: targetPrice ? Number(targetPrice) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toastSuccess('Instrument added to watchlist');
      setAddOpen(false);
      setPicked(null);
      setSearch('');
      setTargetPrice('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
    onError: (err) => toastError('Could not add instrument', apiErrorMessage(err)),
  });

  const toggleFavorite = useMutation({
    mutationFn: ({ item, favorite }: { item: WatchlistItem; favorite: boolean }) =>
      watchlistItemsApi.patch(item.id, { favorite }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['watchlists'] }),
    onError: (err) => toastError('Update failed', apiErrorMessage(err)),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => watchlistItemsApi.remove(itemId),
    onSuccess: () => {
      toastSuccess('Removed from watchlist');
      void queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
    onError: (err) => toastError('Remove failed', apiErrorMessage(err)),
  });

  const createAlert = useMutation({
    mutationFn: () =>
      watchlistAlertsApi.create({
        instrument: alertForm.instrument_symbol,
        watchlist: alertForm.watchlist || null,
        condition: alertForm.condition,
        threshold: Number(alertForm.threshold),
        active: alertForm.active,
      }),
    onSuccess: () => {
      toastSuccess('Alert created', 'You’ll be notified when the condition triggers.');
      setAlertOpen(false);
      setAlertForm(emptyAlertForm());
      void queryClient.invalidateQueries({ queryKey: ['watchlist-alerts'] });
    },
    onError: (err) => toastError('Could not create alert', apiErrorMessage(err)),
  });

  const toggleAlert = useMutation({
    mutationFn: ({ alert, active }: { alert: WatchlistAlert; active: boolean }) =>
      watchlistAlertsApi.patch(alert.id, { active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['watchlist-alerts'] }),
    onError: (err) => toastError('Update failed', apiErrorMessage(err)),
  });

  const removeAlert = useMutation({
    mutationFn: (id: string) => watchlistAlertsApi.remove(id),
    onSuccess: () => {
      toastSuccess('Alert deleted');
      void queryClient.invalidateQueries({ queryKey: ['watchlist-alerts'] });
    },
    onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
  });

  const createList = useMutation({
    mutationFn: () => watchlistsApi.create({ name: newListName }),
    onSuccess: () => {
      toastSuccess('Watchlist created');
      setNewListOpen(false);
      setNewListName('');
      void queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
    onError: (err) => toastError('Could not create watchlist', apiErrorMessage(err)),
  });

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'alerts', label: 'Alerts', badge: alerts.data?.length ?? 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Watchlists</h1>
          <p className="page-sub">Track instruments, prices and target alerts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setNewListOpen(true)} icon={<Plus size={15} />}>
            New list
          </Button>
          <Button onClick={() => { setAddWatchlist(watchlists.data?.[0]?.id ?? ''); setAddOpen(true); }} icon={<Plus size={15} />}>
            Add instrument
          </Button>
          <Button variant="secondary" onClick={() => setAlertOpen(true)} icon={<Bell size={15} />}>
            New alert
          </Button>
        </div>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        overview.isLoading ? (
          <SkeletonCard rows={5} />
        ) : (overview.data ?? []).length === 0 ? (
          <Card>
            <EmptyState
              title="No watchlists yet"
              message="Create a watchlist and add instruments to track their prices and set target alerts."
              action={
                <Button onClick={() => { setAddWatchlist(watchlists.data?.[0]?.id ?? ''); setAddOpen(true); }} icon={<Plus size={15} />}>
                  Add your first instrument
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {(overview.data ?? []).map((wl: WatchlistOverviewItem) => (
              <WatchlistCard
                key={wl.id}
                watchlist={wl}
                onAddItem={() => {
                  setAddWatchlist(wl.id);
                  setAddOpen(true);
                }}
                onToggleFavorite={(itemId, favorite) => toggleFavorite.mutate({ item: { id: itemId } as WatchlistItem, favorite })}
                onRemoveItem={(itemId) => removeItem.mutate(itemId)}
                locale={locale}
              />
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardHeader title="Price alerts" subtitle="Triggered by the market-data refresh job" />
          {alerts.isLoading ? (
            <SkeletonCard rows={3} />
          ) : (alerts.data ?? []).length === 0 ? (
            <EmptyState
              title="No alerts yet"
              message="Create an alert to be notified when an instrument crosses a price or moves by a percentage."
              action={<Button variant="secondary" size="sm" onClick={() => setAlertOpen(true)} icon={<Bell size={14} />}>Create alert</Button>}
            />
          ) : (
            <Table<WatchlistAlert>
              columns={[
                {
                  key: 'instrument',
                  header: 'Instrument',
                  render: (a) => (
                    <div>
                      <p className="font-semibold">{a.instrument.symbol}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{a.instrument.name}</p>
                    </div>
                  ),
                },
                {
                  key: 'condition',
                  header: 'Condition',
                  render: (a) => (
                    <Badge tone="primary">
                      {a.condition === 'change_pct' ? `daily change ${parseMoney(a.threshold) >= 0 ? '≥' : '≤'} ${parseMoney(a.threshold).toFixed(1)}%` : `${a.condition} ${formatMoney(a.threshold, a.instrument.currency, locale)}`}
                    </Badge>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (a) => <Badge tone={a.active ? 'success' : 'muted'}>{a.active ? 'Active' : 'Paused'}</Badge>,
                },
                {
                  key: 'last',
                  header: 'Last triggered',
                  render: (a) => (a.last_triggered_at ? new Date(a.last_triggered_at).toLocaleString(locale) : '—'),
                },
                {
                  key: 'history',
                  header: 'Triggers',
                  render: (a) => (
                    <Button variant="ghost" size="sm" onClick={() => setTriggersAlert(a)} icon={<History size={13} />}>
                      History
                    </Button>
                  ),
                },
                {
                  key: 'active',
                  header: 'Enabled',
                  render: (a) => (
                    <Toggle checked={a.active} size="sm" onChange={(v) => toggleAlert.mutate({ alert: a, active: v })} aria-label={`Toggle alert for ${a.instrument.symbol}`} />
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (a) => (
                    <button
                      className="btn btn-ghost btn-sm !px-1.5"
                      onClick={() => {
                        if (window.confirm(`Delete alert for ${a.instrument.symbol}?`)) removeAlert.mutate(a.id);
                      }}
                      aria-label={`Delete alert ${a.id}`}
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  ),
                },
              ]}
              data={alerts.data ?? []}
              rowKey={(a) => a.id}
              loading={alerts.isLoading}
            />
          )}
        </Card>
      )}

      {/* Add instrument modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add instrument to watchlist"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addItem.mutate()} loading={addItem.isPending} disabled={!picked || !addWatchlist}>
              Add to watchlist
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addItem.mutate();
          }}
        >
          <div>
            <label className="field-label">Watchlist</label>
            <select className="select" value={addWatchlist} onChange={(e) => setAddWatchlist(e.target.value)}>
              {(watchlists.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Instrument</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by symbol or name…"
              autoFocus
            />
            {debouncedSearch.trim().length >= 1 ? (
              <div className="mt-2 rounded-xl overflow-hidden card" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {(instrumentResults.data?.results ?? []).map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:opacity-80 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => {
                      setPicked(inst);
                      setSearch(inst.symbol);
                    }}
                  >
                    <span>
                      <span className="text-sm font-semibold">{inst.symbol}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>{inst.name}</span>
                    </span>
                    <Badge tone="muted">{inst.asset_class}</Badge>
                  </button>
                ))}
                {(instrumentResults.data?.results ?? []).length === 0 && !instrumentResults.isLoading ? (
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--muted)' }}>No matches</p>
                ) : null}
              </div>
            ) : null}
          </div>
          {picked ? (
            <p className="text-sm flex items-center gap-2">
              Selected: <span className="font-semibold">{picked.symbol}</span>{' '}
              {picked.latest_price ? `· ${formatMoney(picked.latest_price, picked.currency, locale)}` : ''}
            </p>
          ) : null}
          <Input label="Target price (optional)" type="number" step="any" min="0" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="e.g. 180.00" />
          <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why are you watching this?" />
        </form>
      </Modal>

      {/* Trigger history modal */}
      <Modal
        open={Boolean(triggersAlert)}
        onClose={() => setTriggersAlert(null)}
        title={`Trigger history — ${triggersAlert?.instrument.symbol ?? ''}`}
        subtitle={triggersAlert ? `${triggersAlert.condition.replace(/_/g, ' ')} ${triggersAlert.condition === 'change_pct' ? `${parseMoney(triggersAlert.threshold).toFixed(1)}%` : formatMoney(triggersAlert.threshold, triggersAlert.instrument.currency, locale)}` : undefined}
      >
        <Table<AlertTrigger>
          columns={[
            {
              key: 'price',
              header: 'Price at trigger',
              render: (t) => formatMoney(t.price, triggersAlert?.instrument.currency ?? 'USD', locale),
            },
            {
              key: 'condition',
              header: 'Condition',
              render: (t) => (
                <Badge tone="primary">
                  {t.condition === 'change_pct' ? `change ${parseMoney(t.threshold) >= 0 ? '≥' : '≤'} ${parseMoney(t.threshold).toFixed(1)}%` : `${t.condition} ${formatMoney(t.threshold, triggersAlert?.instrument.currency ?? 'USD', locale)}`}
                </Badge>
              ),
            },
            {
              key: 'triggered_at',
              header: 'Triggered',
              render: (t) => new Date(t.triggered_at).toLocaleString(locale),
            },
          ]}
          data={triggers.data?.results ?? []}
          rowKey={(t) => t.id}
          loading={triggers.isLoading}
          emptyTitle="No triggers yet"
          emptyMessage="This alert hasn’t fired yet."
          skeletonRows={4}
        />
        {triggers.data && triggers.data.next ? (
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Showing the most recent triggers.
          </p>
        ) : null}
      </Modal>

      {/* New alert modal */}
      <Modal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        title="Create price alert"
        subtitle="Notifications are pushed in real time when the condition triggers"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAlertOpen(false)}>Cancel</Button>
            <Button onClick={() => createAlert.mutate()} loading={createAlert.isPending} disabled={!alertForm.instrument_symbol || !alertForm.threshold}>
              Create alert
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createAlert.mutate();
          }}
        >
          <div>
            <label className="field-label">Instrument</label>
            <Input
              value={alertForm.instrument_symbol}
              onChange={(e) => setAlertForm((f) => ({ ...f, instrument_symbol: e.target.value }))}
              placeholder="Symbol, e.g. AAPL"
            />
            <p className="field-hint">Enter the ticker symbol exactly as listed (e.g. GOOGL, SPY).</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Condition</label>
              <select
                className="select"
                value={alertForm.condition}
                onChange={(e) => setAlertForm((f) => ({ ...f, condition: e.target.value as AlertForm['condition'] }))}
              >
                <option value="above">Price above</option>
                <option value="below">Price below</option>
                <option value="change_pct">Daily change %</option>
              </select>
            </div>
            <Input label={alertForm.condition === 'change_pct' ? 'Change % threshold' : 'Price threshold'} type="number" step="any" required value={alertForm.threshold} onChange={(e) => setAlertForm((f) => ({ ...f, threshold: e.target.value }))} placeholder={alertForm.condition === 'change_pct' ? 'e.g. 5' : 'e.g. 180'} />
          </div>
          <div>
            <label className="field-label">Watchlist (optional)</label>
            <select className="select" value={alertForm.watchlist} onChange={(e) => setAlertForm((f) => ({ ...f, watchlist: e.target.value }))}>
              <option value="">All watchlists</option>
              {(watchlists.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <Toggle checked={alertForm.active} onChange={(v) => setAlertForm((f) => ({ ...f, active: v }))} label="Active immediately" />
        </form>
      </Modal>

      {/* New watchlist modal */}
      <Modal
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        title="Create watchlist"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewListOpen(false)}>Cancel</Button>
            <Button onClick={() => createList.mutate()} loading={createList.isPending} disabled={!newListName.trim()}>
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createList.mutate();
          }}
        >
          <Input label="Name" required value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="e.g. Tech watch" autoFocus />
        </form>
      </Modal>
    </div>
  );
}

interface WatchlistCardProps {
  watchlist: WatchlistOverviewItem;
  onAddItem: () => void;
  onToggleFavorite: (itemId: string, favorite: boolean) => void;
  onRemoveItem: (itemId: string) => void;
  locale: string;
}

/**
 * Renders one watchlist using the overview (prices) and the items endpoint
 * (ids, so favorite/remove can target the right watchlist-item).
 */
function WatchlistCard({ watchlist, onAddItem, onToggleFavorite, onRemoveItem, locale }: WatchlistCardProps) {
  const items = useQuery({
    queryKey: ['watchlist', watchlist.id, 'items'],
    queryFn: () => watchlistsApi.items(watchlist.id),
  });

  const sparklines = useQuery({
    queryKey: ['watchlist', watchlist.id, 'sparklines'],
    queryFn: () => watchlistsApi.sparklines(watchlist.id),
  });

  const sparklineMap = new Map<string, SparklineItem>(
    (sparklines.data ?? []).map((s) => [s.instrument_symbol, s]),
  );

  // Merge overview items (prices) with full items (ids, notes, favorite).
  const merged = (items.data ?? [])
    .map((full) => {
      const ov = watchlist.items.find((o) => o.instrument.symbol === full.instrument.symbol);
      return { full, ov };
    })
    .filter((m): m is { full: WatchlistItem; ov: NonNullable<typeof m.ov> } => Boolean(m.ov));

  return (
    <Card>
      <CardHeader title={watchlist.name} subtitle={`${watchlist.items.length} item${watchlist.items.length === 1 ? '' : 's'}`} />
      {items.isLoading ? (
        <SkeletonCard rows={3} />
      ) : merged.length === 0 ? (
        <EmptyState
          title="Empty watchlist"
          message="Search for an instrument to add it here."
          action={
            <Button variant="secondary" size="sm" onClick={onAddItem}>
              Add instrument
            </Button>
          }
          compact
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th className="text-right">Last price</th>
                <th className="text-right">Change</th>
                <th className="text-right">Target</th>
                <th className="text-right">Distance</th>
                <th>30d trend</th>
                <th>Fav</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {merged.map(({ full, ov }) => {
                const dist = parseMoney(ov.distance_pct);
                return (
                  <tr key={full.id}>
                    <td>
                      <p className="font-semibold">{ov.instrument.symbol}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{ov.instrument.name}</p>
                    </td>
                    <td className="text-right font-medium">
                      {ov.last_price !== null && ov.last_price !== undefined
                        ? formatMoney(ov.last_price, ov.instrument.currency, locale)
                        : '—'}
                    </td>
                    <td className={`text-right ${signClass(ov.change_pct)}`}>
                      {ov.change_pct !== null && ov.change_pct !== undefined ? formatPercent(ov.change_pct) : '—'}
                    </td>
                    <td className="text-right">
                      {ov.target_price !== null && ov.target_price !== undefined
                        ? formatMoney(ov.target_price, ov.instrument.currency, locale)
                        : '—'}
                    </td>
                    <td className={`text-right ${signClass(ov.distance_pct)}`}>
                      {ov.distance_pct !== null && ov.distance_pct !== undefined ? `${dist.toFixed(1)}%` : '—'}
                    </td>
                    <td>
                      <Sparkline data={(sparklineMap.get(ov.instrument.symbol)?.series ?? []).map((p) => ({ date: p.date, close: parseMoney(p.close) }))} />
                    </td>
                    <td>
                      <button
                        onClick={() => onToggleFavorite(full.id, !full.favorite)}
                        aria-label={full.favorite ? 'Unfavorite' : 'Favorite'}
                        style={{ color: full.favorite ? 'var(--warning)' : 'var(--muted)' }}
                      >
                        <Star size={15} fill={full.favorite ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-sm !px-1.5"
                        onClick={() => onRemoveItem(full.id)}
                        aria-label={`Remove ${ov.instrument.symbol}`}
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Tiny 30-day price sparkline for a watchlist item. */

