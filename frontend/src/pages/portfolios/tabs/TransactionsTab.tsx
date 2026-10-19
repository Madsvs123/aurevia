import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format } from 'date-fns';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { accountsApi, portfoliosApi, transactionsApi } from '../../../api/endpoints';
import type {
  CorporateActionType,
  Transaction,
  TransactionPayload,
  TransactionType,
} from '../../../api/types';
import { formatMoney, parseMoney, signClass } from '../../../api/types';
import { Badge, Button, Card, CardHeader, Input, Modal, Select, Table, StatCard } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';
import { useInfiniteTransactions } from '../../../hooks/useInfiniteTransactions';
import { usePortfolio } from '../../../hooks/usePortfolio';
import { apiErrorMessage } from '../../../api/client';
import { toastError, toastSuccess } from '../../../store/toast';
import { InstrumentSearch } from '../../../components/search/InstrumentSearch';

interface TransactionsTabProps {
  portfolioId: string;
}

const TX_TYPES: TransactionType[] = [
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'dividend',
  'interest',
  'fee',
  'transfer',
  'corporate_action',
];

const CORPORATE_ACTIONS: CorporateActionType[] = ['split', 'merger', 'spinoff', 'name_change'];

const typeOptions = TX_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }));
const caOptions = CORPORATE_ACTIONS.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }));

interface TxForm {
  type: TransactionType;
  account: string;
  instrument_symbol: string;
  quantity: string;
  price: string;
  amount: string;
  fee: string;
  date: string;
  notes: string;
  corporate_action_type: string;
}

const emptyForm = (): TxForm => ({
  type: 'buy',
  account: '',
  instrument_symbol: '',
  quantity: '',
  price: '',
  amount: '',
  fee: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
  corporate_action_type: '',
});

export default function TransactionsTab({ portfolioId }: TransactionsTabProps) {
  const { profile } = useAuth();
  const locale = profile?.locale ?? 'en-US';
  const { invalidate } = usePortfolio(portfolioId);

  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const tx = useInfiniteTransactions({ portfolioId, type: filterType, from: filterFrom, to: filterTo });

  const summary = useQuery({
    queryKey: ['portfolio', portfolioId, 'transactions', 'summary'],
    queryFn: () => portfoliosApi.transactionsSummary(portfolioId),
  });

  const accounts = useQuery({
    queryKey: ['portfolio', portfolioId, 'accounts'],
    queryFn: () => accountsApi.list(portfolioId),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<TxForm>(emptyForm());
  const [selectedInstrument, setSelectedInstrument] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: TransactionPayload = {
        type: form.type,
        date: form.date,
        account: form.account || null,
        instrument: selectedInstrument,
        quantity: form.quantity ? Number(form.quantity) : null,
        price: form.price ? Number(form.price) : null,
        amount: form.amount ? Number(form.amount) : null,
        fee: form.fee ? Number(form.fee) : 0,
        notes: form.notes || null,
        currency: undefined,
        corporate_action_type:
          form.type === 'corporate_action' && form.corporate_action_type
            ? (form.corporate_action_type as CorporateActionType)
            : null,
      };
      if (!editing) return transactionsApi.patch(editing.id, payload);
      return transactionsApi.create(portfolioId, payload);
    },
    onSuccess: () => {
      toastSuccess(editing ? 'Transaction updated' : 'Transaction added');
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm());
      setSelectedInstrument(null);
      void tx.invalidate();
      invalidate();
      void summary.refetch();
    },
    onError: (err) => toastError(editing ? 'Update failed' : 'Add failed', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsApi.remove(id),
    onSuccess: () => {
      toastSuccess('Transaction deleted', 'Holdings have been recomputed.');
      void tx.invalidate();
      invalidate();
      void summary.refetch();
    },
    onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setSelectedInstrument(null);
    setModalOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setSelectedInstrument(t.instrument?.id ?? null);
    setForm({
      type: t.type,
      account: t.account ?? '',
      instrument_symbol: t.instrument?.symbol ?? '',
      quantity: t.quantity ?? '',
      price: t.price ?? '',
      amount: t.amount,
      fee: t.fee,
      date: t.date,
      notes: t.notes ?? '',
      corporate_action_type: t.corporate_action_type ?? '',
    });
    setModalOpen(true);
  };

  const currency = tx.transactions[0]?.currency ?? profile?.base_currency ?? 'USD';
  const s = summary.data;

  const showInstrument = ['buy', 'sell', 'dividend', 'corporate_action'].includes(form.type);
  const showQuantity = ['buy', 'sell'].includes(form.type);
  const showPrice = ['buy', 'sell'].includes(form.type);
  const showAmount = !['buy', 'sell'].includes(form.type);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Total buys" value={s ? formatMoney(s.total_buys, currency, locale) : undefined} loading={summary.isLoading} currency={currency} />
        <StatCard label="Total sells" value={s ? formatMoney(s.total_sells, currency, locale) : undefined} loading={summary.isLoading} currency={currency} />
        <StatCard label="Dividends" value={s ? formatMoney(s.dividends, currency, locale) : undefined} loading={summary.isLoading} currency={currency} />
        <StatCard label="Fees" value={s ? formatMoney(s.fees, currency, locale) : undefined} loading={summary.isLoading} currency={currency} />
        <StatCard
          label="Net cash flow"
          value={s ? formatMoney(s.net_cashflow, currency, locale) : undefined}
          loading={summary.isLoading}
          delta={s ? formatMoney(s.net_cashflow, currency, locale) : undefined}
          currency={currency}
        />
      </div>

      <Card>
        <CardHeader
          title={`Transactions (${tx.totalCount})`}
          subtitle="Newest first · paginated"
          action={
            <Button size="sm" onClick={openAdd} icon={<Plus size={14} />}>
              Add transaction
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="w-44">
            <Select
              options={[{ value: '', label: 'All types' }, ...typeOptions]}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as TransactionType | '')}
              aria-label="Filter by type"
            />
          </div>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} aria-label="From date" className="!w-40" />
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} aria-label="To date" className="!w-40" />
          {(filterType || filterFrom || filterTo) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterType('');
                setFilterFrom('');
                setFilterTo('');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <Table<Transaction>
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (t) => <span className="text-xs">{format(new Date(`${t.date}T00:00:00`), 'MMM d, yyyy')}</span>,
            },
            {
              key: 'type',
              header: 'Type',
              render: (t) => (
                <Badge tone={t.type === 'buy' || t.type === 'deposit' || t.type === 'interest' ? 'success' : t.type === 'sell' || t.type === 'withdrawal' || t.type === 'fee' ? 'danger' : 'info'}>
                  {t.type.replace(/_/g, ' ')}
                  {t.corporate_action_type ? ` · ${t.corporate_action_type.replace(/_/g, ' ')}` : ''}
                </Badge>
              ),
            },
            {
              key: 'symbol',
              header: 'Symbol',
              render: (t) => (t.instrument ? <span className="font-medium">{t.instrument.symbol}</span> : <span style={{ color: 'var(--muted)' }}>—</span>),
            },
            {
              key: 'qty',
              header: 'Qty',
              align: 'right',
              render: (t) => (t.quantity !== null ? parseMoney(t.quantity).toLocaleString(locale, { maximumFractionDigits: 4 }) : '—'),
            },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (t) => (t.price !== null ? formatMoney(t.price, t.currency, locale) : '—'),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (t) => <span className={signClass(t.amount)}>{formatMoney(t.amount, t.currency, locale)}</span>,
            },
            {
              key: 'fee',
              header: 'Fee',
              align: 'right',
              render: (t) => (parseMoney(t.fee) !== 0 ? formatMoney(t.fee, t.currency, locale) : '—'),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (t) => (
                <div className="flex items-center justify-end gap-1">
                  <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => openEdit(t)} aria-label={`Edit transaction ${t.id}`}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm !px-1.5"
                    onClick={() => {
                      if (window.confirm('Delete this transaction? Holdings will be recomputed.')) {
                        deleteMutation.mutate(t.id);
                      }
                    }}
                    aria-label={`Delete transaction ${t.id}`}
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            },
          ]}
          data={tx.transactions}
          rowKey={(t) => t.id}
          loading={tx.isLoading}
          emptyTitle="No transactions found"
          emptyMessage={filterType || filterFrom || filterTo ? 'Try clearing the filters.' : 'Record your first transaction to get started.'}
          emptyAction={
            filterType || filterFrom || filterTo ? (
              <Button variant="secondary" size="sm" onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo(''); }}>
                Clear filters
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={openAdd}>Add transaction</Button>
            )
          }
        />

        {tx.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button variant="secondary" size="sm" onClick={() => void tx.loadMore()} loading={tx.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit transaction' : 'Add transaction'}
        subtitle="Buy/sell recompute holdings; corporate actions adjust positions."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save changes' : 'Add transaction'}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div>
            <label className="field-label">Type</label>
            <select
              className="select"
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as TransactionType;
                setForm((f) => ({ ...f, type, corporate_action_type: type === 'corporate_action' ? f.corporate_action_type : '' }));
              }}
            >
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Account</label>
            <select
              className="select"
              value={form.account}
              onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
            >
              <option value="">No account (cash)</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.kind}</option>
              ))}
            </select>
            {accounts.data && accounts.data.length === 0 ? (
              <p className="field-hint">No accounts yet — add one in the Accounts tab, or leave empty.</p>
            ) : null}
          </div>

          {showInstrument ? (
            <div className="sm:col-span-2">
              <label className="field-label">Instrument {form.type === 'corporate_action' ? '(affected position)' : ''}</label>
              <InstrumentSearch
                onSelect={(inst) => {
                  setSelectedInstrument(inst.id);
                  setForm((f) => ({ ...f, instrument_symbol: inst.symbol }));
                }}
                placeholder={form.instrument_symbol || 'Search and pick an instrument…'}
              />
            </div>
          ) : null}

          {showQuantity ? (
            <Input label="Quantity" type="number" step="any" min="0" required value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 10.5" />
          ) : null}
          {showPrice ? (
            <Input label="Price" type="number" step="any" min="0" required value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. 145.20" />
          ) : null}
          {showAmount ? (
            <Input label="Amount" type="number" step="any" required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 1000.00" />
          ) : null}

          <Input label="Fee" type="number" step="any" min="0" value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))} placeholder="0.00" />
          <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />

          {form.type === 'corporate_action' ? (
            <div className="sm:col-span-2">
              <label className="field-label">Corporate action type</label>
              <select
                className="select"
                value={form.corporate_action_type}
                onChange={(e) => setForm((f) => ({ ...f, corporate_action_type: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {caOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          <Input label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional note" className="sm:col-span-2" />
        </form>
      </Modal>
    </div>
  );
}
