import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { accountsApi } from '../../../api/endpoints';
import type { Account, AccountKind, ContributionPlan, ContributionPlanPayload } from '../../../api/types';
import { formatMoney } from '../../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Table, Spinner, Toggle } from '../../../components/ui';
import { apiErrorMessage } from '../../../api/client';
import { toastError, toastSuccess } from '../../../store/toast';
import { usePortfolio } from '../../../hooks/usePortfolio';
import { useContributionPlans } from '../../../hooks/useContributionPlans';

interface AccountsTabProps {
  portfolioId: string;
}

function BalanceCell({ accountId, currency }: { accountId: string; currency: string }) {
  const balance = useQuery({
    queryKey: ['account', accountId, 'balanc'],
    queryFn: () => accountsApi.balance(accountId),
    staleTime: 30_000,
  });
  if (balance.isLoading) return <Spinner size={14} />;
  if (balance.data) return <span className="font-medium">{formatMoney(balance.data.balance, currency)}</span>;
  return <span style={{ color: 'var(--muted)' }}>—</span>;
}

const KIND_OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'retirement', label: 'Retirement' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'AED', 'EGP', 'SAR'];

interface AccForm {
  name: string;
  broker: string;
  currency: string;
  kind: AccountKind;
}

export default function AccountsTab({ portfolioId }: AccountsTabProps) {
  const { detail, invalidate } = usePortfolio(portfolioId);
  const portfolioCurrency = detail.data?.currency ?? 'USD';

  const accounts = useQuery({
    queryKey: ['portfolio', portfolioId, 'accounts'],
    queryFn: () => accountsApi.list(portfolioId),
  });

  const { plans, createPlan, togglePlan, removePlan } = useContributionPlans(portfolioId);

  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState<ContributionPlanPayload>({
    amount: '',
    frequency: 'monthly',
    day_of_month: 1,
    account: null,
    is_active: true,
  });

  const createPlanMutation = createPlan;
  const togglePlanMutation = togglePlan;
  const removePlanMutation = removePlan;

  const submitPlan = async () => {
    try {
      await createPlanMutation.mutateAsync({
        ...planForm,
        amount: Number(planForm.amount),
        day_of_month: planForm.day_of_month ?? null,
        account: planForm.account || null,
      });
      toastSuccess('Contribution plan created');
      setPlanOpen(false);
      setPlanForm({ amount: '', frequency: 'monthly', day_of_month: 1, account: null, is_active: true });
    } catch (err) {
      toastError('Could not create plan', apiErrorMessage(err));
    }
  };

  const toggleActive = (plan: ContributionPlan, is_active: boolean) =>
    togglePlanMutation.mutate(
      { id: plan.id, is_active },
      {
        onError: (err) => toastError('Update failed', apiErrorMessage(err)),
      },
    );

  const deletePlan = (plan: ContributionPlan) =>
    removePlanMutation.mutate(plan.id, {
      onSuccess: () => toastSuccess('Plan deleted'),
      onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
    });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccForm>({ name: '', broker: '', currency: portfolioCurrency, kind: 'brokerage' });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', broker: '', currency: portfolioCurrency, kind: 'brokerage' });
    setModalOpen(true);
  };

  const openEdit = (a: Account) => {
    setEditing(a);
    setForm({ name: a.name, broker: a.broker, currency: a.currency, kind: a.kind });
    setModalOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, broker: form.broker, currency: form.currency, kind: form.kind };
      if (editing) return accountsApi.patch(editing.id, payload);
      return accountsApi.create(portfolioId, payload);
    },
    onSuccess: () => {
      toastSuccess(editing ? 'Account updated' : 'Account created');
      setModalOpen(false);
      void accounts.refetch();
      invalidate();
    },
    onError: (err) => toastError('Save failed', apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => accountsApi.remove(id),
    onSuccess: () => {
      toastSuccess('Account deleted');
      void accounts.refetch();
    },
    onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Accounts (${accounts.data?.length ?? 0})`}
          subtitle="Cash, brokerage and retirement sub-accounts within this portfolio"
          action={
            <Button size="sm" onClick={openAdd} icon={<Plus size={14} />}>
              Add account
            </Button>
          }
        />
        <Table<Account>
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (a) => <span className="font-semibold">{a.name}</span>,
            },
            {
              key: 'kind',
              header: 'Kind',
              render: (a) => <Badge tone={a.kind === 'retirement' ? 'info' : a.kind === 'cash' ? 'success' : 'primary'}>{a.kind}</Badge>,
            },
            { key: 'broker', header: 'Broker', render: (a) => a.broker || '—' },
            { key: 'currency', header: 'Currency', render: (a) => a.currency },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (a) => <BalanceCell accountId={a.id} currency={a.currency} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (a) => (
                <div className="flex items-center justify-end gap-1">
                  <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => openEdit(a)} aria-label={`Edit ${a.name}`}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm !px-1.5"
                    onClick={() => {
                      if (window.confirm(`Delete account “${a.name}”? Transactions referencing it will keep their records.`)) {
                        remove.mutate(a.id);
                      }
                    }}
                    aria-label={`Delete ${a.name}`}
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            },
          ]}
          data={accounts.data ?? []}
          rowKey={(a) => a.id}
          loading={accounts.isLoading}
          emptyTitle="No accounts yet"
          emptyMessage="Accounts group your cash, brokerage and retirement holdings. Create one to attach transactions to it."
          emptyAction={<Button variant="secondary" size="sm" onClick={openAdd}>Add account</Button>}
        />
      </Card>

      {accounts.data && accounts.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Why add accounts?"
            message="Each account has its own balance and currency, and transactions can be linked to it for clearer reporting."
            compact
          />
        </Card>
      ) : null}

      {/* Contribution plans */}
      <Card>
        <CardHeader
          title={`Contribution plans (${plans.data?.length ?? 0})`}
          subtitle="Recurring contributions into this portfolio — paused or resumed anytime"
          action={
            <Button size="sm" onClick={() => setPlanOpen(true)} icon={<Plus size={14} />}>
              New plan
            </Button>
          }
        />
        {plans.isLoading ? (
          <Spinner size={16} />
        ) : (plans.data ?? []).length === 0 ? (
          <EmptyState
            title="No contribution plans"
            message="Set up a recurring contribution to automate your investing."
            action={
              <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)} icon={<Plus size={13} />}>
                Create plan
              </Button>
            }
            compact
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Frequency</th>
                  <th>Day</th>
                  <th>Account</th>
                  <th>Next run</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(plans.data ?? []).map((pl) => (
                  <tr key={pl.id}>
                    <td className="font-semibold">{formatMoney(pl.amount, portfolioCurrency)}</td>
                    <td>
                      <Badge tone="primary">{pl.frequency.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td>{pl.day_of_month ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{pl.account ?? 'Portfolio default'}</td>
                    <td className="text-xs">{pl.next_run ? new Date(pl.next_run).toLocaleDateString() : '—'}</td>
                    <td>
                      <Toggle
                        checked={pl.is_active}
                        size="sm"
                        onChange={(v) => toggleActive(pl, v)}
                        aria-label={`Toggle plan ${pl.id}`}
                      />
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-sm !px-1.5"
                        onClick={() => {
                          if (window.confirm(`Delete this ${pl.frequency.replace(/_/g, ' ')} plan of ${formatMoney(pl.amount, portfolioCurrency)}?`)) {
                            deletePlan(pl);
                          }
                        }}
                        aria-label="Delete plan"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="New contribution plan"
        subtitle="Recurring amount contributed into this portfolio"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button onClick={() => void submitPlan()} loading={createPlanMutation.isPending} disabled={!planForm.amount}>
              Create plan
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPlan();
          }}
        >
          <Input label="Amount" type="number" step="any" min="0" required value={planForm.amount} onChange={(e) => setPlanForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Frequency</label>
              <select
                className="select"
                value={planForm.frequency}
                onChange={(e) => setPlanForm((f) => ({ ...f, frequency: e.target.value }))}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <Input label="Day of month" type="number" min="1" max="31" value={planForm.day_of_month ?? 1} onChange={(e) => setPlanForm((f) => ({ ...f, day_of_month: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="field-label">Account (optional)</label>
            <select className="select" value={planForm.account ?? ''} onChange={(e) => setPlanForm((f) => ({ ...f, account: e.target.value || null }))}>
              <option value="">Portfolio default</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit account' : 'Add account'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim()}>
              {editing ? 'Save changes' : 'Create account'}
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
          <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Main brokerage" autoFocus />
          <div>
            <label className="field-label">Kind</label>
            <select className="select" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AccountKind }))}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Input label="Broker (optional)" value={form.broker} onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))} placeholder="e.g. Interactive Brokers" />
          <div>
            <label className="field-label">Currency</label>
            <select className="select" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}
