import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, TrendingUp, UserPlus, Users, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { aumApi, clientsApi } from '../../api/endpoints';
import type { AssignedClient } from '../../api/types';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, SkeletonCard, StatCard } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

interface SearchUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

export default function ClientsPage() {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const queryClient = useQueryClient();

  const clients = useQuery({ queryKey: ['clientss'], queryFn: clientsApi.list });
  const aum = useQuery({ queryKey: ['clients', 'aum'], queryFn: aumApi.summary });

  const [assignOpen, setAssignOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [pickedUser, setPickedUser] = useState<SearchUser | null>(null);
  const debouncedSearch = useDebounce(userSearch, 350);

  const userResults = useQuery({
    queryKey: ['users', 'search', debouncedSearch],
    queryFn: async () => {
      const { apiClient } = await import('../../api/client');
      const res = await apiClient.get<{ count: number; results: SearchUser[] }>('/users/', {
        params: { search: debouncedSearch },
      });
      return res.data;
    },
    enabled: debouncedSearch.trim().length >= 2,
  });

  const assign = useMutation({
    mutationFn: () => clientsApi.assign(pickedUser!.id),
    onSuccess: () => {
      toastSuccess('Client assigned', 'You can now view their portfolio summaries.');
      setAssignOpen(false);
      setPickedUser(null);
      setUserSearch('');
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => toastError('Could not assign client', apiErrorMessage(err)),
  });

  const list = clients.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-sub">Advisor workspace — assigned clients and their portfolio summaries.</p>
        </div>
        <Button onClick={() => setAssignOpen(true)} icon={<UserPlus size={15} />}>
          Assign client
        </Button>
      </div>

      {/* AUM summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Clients"
          value={aum.data ? String(aum.data.clients_count - 1) : undefined}
          loading={aum.isLoading}
          icon={<Users size={15} />}
        />
        <StatCard
          label="Assets under management"
          value={aum.data ? formatMoney(aum.data.aum, currency, locale) : undefined}
          loading={aum.isLoading}
          icon={<Briefcase size={15} />}
          currency={currency}
        />
        <StatCard
          label="Avg return YTD"
          value={aum.data ? formatPercent(aum.data.avg_return_ytd_pct) : undefined}
          loading={aum.isLoading}
          delta={aum.data ? formatPercent(aum.data.avg_return_ytd_pct) : undefined}
          deltaLabel="YTD"
          icon={<TrendingUp size={15} />}
        />
        <StatCard
          label="Net flows YTD"
          value={aum.data ? formatMoney(aum.data.net_flows_ytd, currency, locale) : undefined}
          loading={aum.isLoading}
          delta={aum.data ? formatPercent(parseMoney(aum.data.net_flows_ytd)) : undefined}
          icon={parseMoney(aum.data?.net_flows_ytd) >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
          currency={currency}
        />
      </div>

      {/* Client portfolios */}
      {aum.data && aum.data.portfolios.length > 0 ? (
        <Card>
          <CardHeader title="Client portfolios" subtitle="Value and YTD return per assigned portfolio" />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Portfolio</th>
                  <th>Owner</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Return YTD</th>
                </tr>
              </thead>
              <tbody>
                {aum.data.portfolios.map((p) => (
                  <tr key={p.id}>
                    <td className="font-semibold">{p.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{p.owner_email}</td>
                    <td className="text-right">{formatMoney(p.value, currency, locale)}</td>
                    <td className={`text-right ${signClass(p.return_ytd_pct)}`}>{formatPercent(p.return_ytd_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {clients.isLoading ? (
        <SkeletonCard rows={5} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="No assigned clients"
            message="Assign a client to see their portfolio value and returns here. You’ll get read-only access to their portfolios."
            icon={<Users size={22} />}
            action={<Button onClick={() => setAssignOpen(true)} icon={<UserPlus size={15} />}>Assign your first client</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((c: AssignedClient) => (
            <Link key={c.id} to={`/clients/${c.client.id}`} className="card card-pad block hover:opacity-90 transition-opacity">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex items-center justify-center rounded-full text-white font-semibold text-sm"
                  style={{ width: 40, height: 40, background: 'var(--accent)' }}
                >
                  {c.client.first_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {c.client.first_name} {c.client.last_name}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{c.client.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>Status</span>
                <Badge tone={c.status === 'active' ? 'success' : 'info'}>{c.status.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
                Assigned {new Date(c.assigned_at).toLocaleDateString(locale)}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign a client"
        subtitle="Search for an Aurevia user by name or email"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => assign.mutate()} loading={assign.isPending} disabled={!pickedUser}>
              Assign client
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search users… (min 2 characters)"
            autoFocus
            aria-label="Search users"
          />
          {debouncedSearch.trim().length >= 2 ? (
            <div className="rounded-xl overflow-hidden card" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {userResults.isLoading ? (
                <p className="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>Searching…</p>
              ) : (userResults.data?.results ?? []).length === 0 ? (
                <p className="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>
                  No users match “{debouncedSearch}”
                </p>
              ) : (
                (userResults.data?.results ?? []).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:opacity-80 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => {
                      setPickedUser(u);
                      setUserSearch(`${u.first_name} ${u.last_name}`.trim() || u.email);
                    }}
                  >
                    <span>
                      <span className="text-sm font-semibold">{u.first_name} {u.last_name}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>{u.email}</span>
                    </span>
                    {pickedUser?.id === u.id ? <Badge tone="success">Selected</Badge> : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {pickedUser ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Assigning <span className="font-semibold">{pickedUser.email}</span> — they’ll appear on your
              client list with read-only portfolio access.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
