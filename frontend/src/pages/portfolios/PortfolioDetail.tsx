import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Card, Tabs, Badge, Modal, Button, Input, SkeletonCard } from '../../components/ui';
import { usePortfolio } from '../../hooks/usePortfolio';
import { toastError, toastSuccess } from '../../store/toast';
import { apiErrorMessage } from '../../api/client';

import OverviewTab from './tabs/OverviewTab';
import HoldingsTab from './tabs/HoldingsTab';
import TransactionsTab from './tabs/TransactionsTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import IncomeTab from './tabs/IncomeTab';
import AccountsTab from './tabs/AccountsTab';
import RebalancingTab from './tabs/RebalancingTab';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'AED', 'EGP', 'SAR'];

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') ?? 'overview';
  const setTab = (t: string) => setSearchParams(t === 'transactions' ? {} : { tab: t }, { replace: true });

  const { detail, updatePortfolio, deletePortfolio } = usePortfolio(id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ name: '', currency: '', description: '' });

  const portfolio = detail.data;

  const openEdit = () => {
    if (!portfolio) return;
    setForm({ name: portfolio.name, currency: 'USD', description: portfolio.description });
    setEditOpen(true);
  };

  const save = async () => {
    if (!id) return;
    try {
      await updatePortfolio({ portfolioId: id, payload: form });
      toastSuccess('Portfolio updated');
      setEditOpen(false);
    } catch (err) {
      toastError('Update failed', apiErrorMessage(err));
    }
  };

  const remove = async () => {
    if (!id) return;
    try {
      await deletePortfolio(id);
      toastSuccess('Portfolio deleted');
      setDeleteOpen(false);
    } catch (err) {
      toastError('Delete failed', apiErrorMessage(err));
    }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'holdings', label: 'Holdings' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'rebalancing', label: 'Rebalancing' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'income', label: 'Income' },
  ];

  const validTab = tabs.some((t) => t.key === tab) ? tab : 'overview';

  return (
    <div className="space-y-5">
      <Link to="/portfolios" className="link text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> All portfolios
      </Link>

      {detail.isLoading ? (
        <SkeletonCard rows={3} />
      ) : !portfolio ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Portfolio not found or you don’t have access to it.
          </p>
          <Link to="/portfolios" className="link text-sm mt-2 inline-block">
            Back to portfolios
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="page-title">{portfolio.name}</h1>
                <Badge tone="primary">{portfolio.currency}</Badge>
                {portfolio.is_archived ? <Badge tone="muted">Archived</Badge> : null}
              </div>
              <p className="page-sub">{portfolio.description || 'No description'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button className="btn btn-secondary btn-sm" onClick={openEdit} aria-label="Edit portfolio">
                <Pencil size={14} /> Edit
              </button>
              <button
                className="btn btn-ghost btn-sm !px-2"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete portfolio"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <Tabs tabs={tabs} active={validTab} onChange={setTab} />

          <div className="pt-5">
            {validTab === 'overview' && <OverviewTab portfolioId={id as string} onAddTransaction={() => setTab('transactions')} />}
            {validTab === 'holdings' && <HoldingsTab portfolioId={id as string} />}
            {validTab === 'transactions' && <TransactionsTab portfolioId={id as string} />}
            {validTab === 'accounts' && <AccountsTab portfolioId={id as string} />}
            {validTab === 'rebalancing' && <RebalancingTab portfolioId={id as string} />}
            {validTab === 'analytics' && <AnalyticsTab portfolioId={id as string} />}
            {validTab === 'income' && <IncomeTab portfolioId={id as string} />}
          </div>
        </>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit portfolio"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim()}>Save changes</Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div>
            <label className="field-label">Currency</label>
            <select className="select" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete portfolio"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete permanently</Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          This will permanently remove <span className="font-semibold">{portfolio?.name}</span> and its
          holdings, transactions and accounts. This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
