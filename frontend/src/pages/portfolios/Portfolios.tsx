import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Plus, Wallet, TrendingUp, TrendingDown, Archive } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfoliosApi } from '../../api/endpoints';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../api/types';
import { Card, Button, Input, Modal, Badge, EmptyState, SkeletonCard } from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';
import { useAuth } from '../../hooks/useAuth';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'AED', 'EGP', 'SAR'];

export default function PortfoliosPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currency = profile?.base_currency ?? 'EUR';
  const locale = profile?.locale ?? 'en-US';

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', currency, description: '' });

  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const create = useMutation({
    mutationFn: () =>
      portfoliosApi.create({ name: form.name, currency: form.currency, description: form.description }),
    onSuccess: (p) => {
      toastSuccess('Portfolio created', `“${p.name}” is ready.`);
      setCreateOpen(false);
      setForm({ name: '', currency, description: '' });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      navigate(`/portfolios/${p.id}`);
    },
    onError: (err) => toastError('Could not create portfolio', apiErrorMessage(err)),
  });

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const duplicate = useMutation({
    mutationFn: (id: string) => portfoliosApi.duplicate(id),
    onSuccess: (p) => {
      toastSuccess('Portfolio duplicated', `“${p.name}” created.`);
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      navigate(`/portfolios/${p.id}`);
    },
    onError: (err) => toastError('Could not duplicate portfolio', apiErrorMessage(err)),
  });

  const list = portfolios.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Portfolios</h1>
          <p className="page-sub">Track investments across accounts, currencies and strategies.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus size={16} />}>
          New portfolio
        </Button>
      </div>

      {portfolios.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} rows={4} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="No portfolios yet"
            message="Create your first portfolio to start tracking holdings, performance and income."
            icon={<Wallet size={22} />}
            action={
              <Button onClick={() => setCreateOpen(true)} icon={<Plus size={16} />}>
                Create your first portfolio
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((p) => {
            const ret = parseMoney(p.summary?.return_pct);
            const value = parseMoney(p.summary?.total_value);
            const unrealized = parseMoney(p.summary?.unrealized_gains);
            return (
              <Link key={p.id} to={`/portfolios/${p.id}`} className="card card-pad block hover:opacity-90 transition-opacity">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {p.description || 'No description'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      className="btn btn-ghost btn-sm !px-1.5"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.confirm(`Duplicate “${p.name}” with its accounts, holdings and targets?`)) {
                          setDuplicatingId(p.id);
                          duplicate.mutate(p.id);
                        }
                      }}
                      disabled={duplicatingId === p.id && duplicate.isPending}
                      aria-label={`Duplicate ${p.name}`}
                      title="Duplicate portfolio"
                    >
                      <Copy size={14} />
                    </button>
                    {p.is_archived ? (
                      <Badge tone="muted"><Archive size={11} /> Archived</Badge>
                    ) : (
                      <Badge tone="primary">{p.currency}</Badge>
                    )}
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight">{formatMoney(value, p.currency, locale)}</p>
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className={`font-semibold flex items-center gap-1 ${signClass(ret)}`}>
                    {ret >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {formatPercent(ret)}
                  </span>
                  <span className={signClass(unrealized)}>
                    {unrealized >= 0 ? '+' : ''}
                    {formatMoney(unrealized, p.currency, locale)} unrealized
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create portfolio"
        subtitle="A portfolio groups accounts, holdings and transactions."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Retirement, Growth, Emergency fund" autoFocus />
          <div>
            <label className="field-label">Currency</label>
            <select
              className="select"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <Input label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this portfolio for?" />
        </form>
      </Modal>
    </div>
  );
}
