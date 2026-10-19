import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, TrendingDown, TrendingUp } from 'lucide-react';
import { clientsApi } from '../../api/endpoints';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../api/types';
import { Button, Card, CardHeader, EmptyState, SkeletonCard } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'EUR';
  const locale = profile?.locale ?? 'en-US';

  const summary = useQuery({
    queryKey: ['clients', id, 'summary'],
    queryFn: () => clientsApi.summary(id as string),
    enabled: Boolean(id),
  });

  if (summary.isLoading) return <SkeletonCard rows={6} />;

  const data = summary.data;

  if (!data) {
    return (
      <Card>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Client not found or not assigned to you.</p>
        <Link to="/clients" className="link text-sm mt-2 inline-block">Back to clients</Link>
      </Card>
    );
  }

  const totalValue = data.portfolios.reduce((s, p) => s + parseMoney(p.value), 0);

  return (
    <div className="space-y-5">
      <Link to="/clients" className="link text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> All clients
      </Link>

      <div className="card card-pad flex items-center gap-4 flex-wrap">
        <div
          className="flex items-center justify-center rounded-full text-white font-semibold text-lg"
          style={{ width: 52, height: 52, background: 'var(--accent)' }}
        >
          {data.client.first_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="page-title">
            {data.client.first_name} {data.client.last_name}
          </h1>
          <p className="page-sub">{data.client.email} · {data.client.is_email_verified ? 'verified' : 'unverified'} · since {new Date(data.client.created_at).toLocaleDateString(locale)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Total managed value</p>
          <p className="text-2xl font-bold tracking-tight">{formatMoney(totalValue, currency, locale)}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title={`Portfolios (${data.portfolios.length})`}
          subtitle="Read-only access as their advisor"
        />
        {data.portfolios.length === 0 ? (
          <EmptyState
            title="No portfolios"
            message="This client hasn’t created any portfolios yet."
            icon={<Briefcase size={22} />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.portfolios.map((p) => {
              const ret = parseMoney(p.return);
              return (
                <Link key={p.id} to={`/portfolios/${p.id}`} className="card card-pad block hover:opacity-90 transition-opacity">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xl font-bold mt-2">{formatMoney(p.value, currency, locale)}</p>
                  <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${signClass(p.return)}`}>
                    {ret >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {formatPercent(p.return)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
        {data.portfolios.length > 0 ? (
          <div className="mt-4">
            <Link to={`/portfolios/${data.portfolios[0].id}`}>
              <Button variant="secondary" size="sm">Open portfolio</Button>
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
