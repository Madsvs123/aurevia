import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CalendarClock, Download, FileBarChart2, FilePlus2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { downloadReport, portfoliosApi, reportsApi, scheduledReportsApi } from '../../api/endpoints';
import type { Report, ReportFormat, ReportKind, ScheduledReportPayload } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, SkeletonCard, Toggle } from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';
const KINDS: { value: ReportKind; label: string }[] = [
  { value: 'holdings', label: 'Holdings' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'performance', label: 'Performance' },
  { value: 'allocation', label: 'Allocation' },
  { value: 'income', label: 'Income' },
  { value: 'realized_gains', label: 'Realized gains' },
  { value: 'portfolio_history', label: 'Portfolio history' },
  { value: 'client_portfolios', label: 'Client portfolios' },
];

const FORMATS: { value: ReportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'XLSX' },
];

const FREQUENCIES: { value: string; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

interface CreateForm {
  kind: ReportKind;
  portfolio: string;
  format: ReportFormat;
  from: string;
  to: string;
}

const statusTone = (s: Report['status']) =>
  s === 'ready' ? 'success' : s === 'failed' ? 'danger' : s === 'processing' ? 'info' : 'warning';

const REFRESH_MS = 40000;

export default function ReportsPage() {
  const queryClient = useQueryClient();

  const reports = useQuery({ queryKey: ['reports'], queryFn: () => reportsApi.list({}) });
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });
  const scheduled = useQuery({ queryKey: ['scheduled-reports'], queryFn: scheduledReportsApi.list });

  const [schedOpen, setSchedOpen] = useState(false);
  const [schedForm, setSchedForm] = useState<ScheduledReportPayload>({
    kind: 'holdings',
    portfolio: '',
    format: 'pdf',
    frequency: 'daily',
    is_active: true,
  });

  const createScheduled = useMutation({
    mutationFn: () =>
      scheduledReportsApi.create({
        ...schedForm,
        portfolio: schedForm.portfolio || null,
      }),
    onSuccess: () => {
      toastSuccess('Schedule created', 'Reports will be generated automatically.');
      setSchedOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
    },
    onError: (err) => toastError('Could not create schedule', apiErrorMessage(err)),
  });

  const toggleScheduled = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      scheduledReportsApi.patch(id, { is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] }),
    onError: (err) => toastError('Update failed', apiErrorMessage(err)),
  });

  const removeScheduled = useMutation({
    mutationFn: (id: string) => scheduledReportsApi.remove(id),
    onSuccess: () => {
      toastSuccess('Schedule deleted');
      void queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
    },
    onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    kind: 'holdings',
    portfolio: '',
    format: 'pdf',
    from: '',
    to: '',
  });

  const create = useMutation({
    mutationFn: () =>
      reportsApi.create({
        kind: form.kind,
        portfolio: form.portfolio || null,
        client: null,
        format: form.format,
        from: form.from || null,
        to: form.to || null,
      }),
    onSuccess: (r) => {
      toastSuccess('Report queued', 'It will be generated in the background.');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void r.id;
    },
    onError: (err) => toastError('Could not create report', apiErrorMessage(err)),
  });

  // Auto-refresh while any report is queued/processing.
  const hasPending = (reports.data?.results ?? []).some((r) => r.status === 'queued' || r.status === 'processing');
  useEffect(() => {
    if (!hasPending) return;
    const t = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [hasPending, queryClient]);

  const download = async (r: Report) => {
    try {
      const ext = r.format === 'pdf' ? 'pdf' : r.format === 'csv' ? 'csv' : 'xlsx';
      const name = `${r.kind.replace(/_/g, '-')}-${format(new Date(r.created_at), 'yyyyMMdd-HHmm')}.${ext}`;
      await downloadReport(r.id, name);
      toastSuccess('Download started', name);
    } catch (err) {
      toastError('Download failed', apiErrorMessage(err));
    }
  };

  const list = reports.data?.results ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Generate holdings, transactions, performance and income exports.</p>
        </div>
        <Button onClick={() => { setForm((f) => ({ ...f, portfolio: portfolios.data?.[0]?.id ?? '' })); setCreateOpen(true); }} icon={<FilePlus2 size={15} />}>
          Generate report
        </Button>
      </div>

      {reports.isLoading ? (
        <SkeletonCard rows={5} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="No reports yet"
            message="Create a report and download it as PDF, CSV or XLSX."
            icon={<FileBarChart2 size={22} />}
            action={
              <Button onClick={() => { setForm((f) => ({ ...f, portfolio: portfolios.data?.[0]?.id ?? '' })); setCreateOpen(true); }} icon={<FilePlus2 size={15} />}>
                Generate your first report
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title={`Reports (${list.length})`} subtitle="Newest first · generated asynchronously" />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Format</th>
                  <th>Portfolio</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Completed</th>
                  <th className="text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-semibold capitalize">{r.kind.replace(/_/g, ' ')}</span>
                      {r.error ? (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>{r.error}</p>
                      ) : null}
                    </td>
                    <td><Badge tone="muted">{r.format.toUpperCase()}</Badge></td>
                    <td style={{ color: 'var(--muted)' }}>
                      {r.portfolio ? (r.params.portfolio_name as string) ?? r.portfolio.slice(0, 8) : '—'}
                    </td>
                    <td>
                      <Badge tone={statusTone(r.status)}>
                        {r.status === 'processing' || r.status === 'queued' ? (
                          <span className="inline-flex items-center gap-1">
                            <RefreshCw size={11} className="animate-spin" /> {r.status}
                          </span>
                        ) : (
                          r.status
                        )}
                      </Badge>
                    </td>
                    <td className="text-xs">{format(new Date(r.created_at), 'MMM d, HH:mm')}</td>
                    <td className="text-xs">{r.completed_at ? format(new Date(r.completed_at), 'MMM d, HH:mm') : '—'}</td>
                    <td className="text-right">
                      {r.status === 'ready' ? (
                        <Button variant="secondary" size="sm" onClick={() => void download(r)} icon={<Download size={13} />}>
                          Download
                        </Button>
                      ) : r.status === 'failed' ? (
                        <Button variant="ghost" size="sm" disabled>Failed</Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled>Generating…</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Scheduled reports */}
      <Card>
        <CardHeader
          title={`Scheduled reports (${scheduled.data?.length ?? 0})`}
          subtitle="Automatically generated on a recurring basis"
          action={
            <Button size="sm" variant="secondary" onClick={() => setSchedOpen(true)} icon={<Plus size={14} />}>
              New schedule
            </Button>
          }
        />
        {scheduled.isLoading ? (
          <SkeletonCard rows={3} />
        ) : (scheduled.data ?? []).length === 0 ? (
          <EmptyState
            title="No scheduled reports"
            message="Set up a recurring report (e.g. a monthly holdings PDF) and it will be generated for you."
            action={
              <Button variant="secondary" size="sm" onClick={() => setSchedOpen(true)} icon={<Plus size={13} />}>
                Create schedule
              </Button>
            }
            compact
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Format</th>
                  <th>Portfolio</th>
                  <th>Frequency</th>
                  <th>Next run</th>
                  <th>Last run</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(scheduled.data ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-semibold capitalize flex items-center gap-1.5">
                        <CalendarClock size={13} style={{ color: 'var(--muted)' }} /> {s.kind.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td><Badge tone="muted">{s.format.toUpperCase()}</Badge></td>
                    <td style={{ color: 'var(--muted)' }}>{s.portfolio ? (portfolios.data ?? []).find((p) => p.id === s.portfolio)?.name ?? s.portfolio.slice(0, 8) : '—'}</td>
                    <td><Badge tone="primary">{s.frequency.replace(/_/g, ' ')}</Badge></td>
                    <td className="text-xs">{s.next_run ? new Date(s.next_run).toLocaleString() : '—'}</td>
                    <td className="text-xs">{s.last_run ? new Date(s.last_run).toLocaleString() : '—'}</td>
                    <td>
                      <Toggle checked={s.is_active} size="sm" onChange={(v) => toggleScheduled.mutate({ id: s.id, is_active: v })} aria-label={`Toggle schedule ${s.id}`} />
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-sm !px-1.5"
                        onClick={() => {
                          if (window.confirm('Delete this scheduled report?')) removeScheduled.mutate(s.id);
                        }}
                        aria-label="Delete schedule"
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate report"
        subtitle="Reports are generated in the background; you’ll get a notification when ready"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.portfolio && form.kind !== 'client_portfolios'}>
              Generate
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <label className="field-label">Report kind</label>
            <select className="select" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ReportKind }))}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Format</label>
            <select className="select" value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as ReportFormat }))}>
              {FORMATS.map((fm) => (
                <option key={fm.value} value={fm.value}>{fm.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Portfolio</label>
            <select className="select" value={form.portfolio} onChange={(e) => setForm((f) => ({ ...f, portfolio: e.target.value }))} disabled={form.kind === 'client_portfolios'}>
              <option value="">{form.kind === 'client_portfolios' ? 'All client portfolios' : 'Select a portfolio…'}</option>
              {(portfolios.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <Input label="From date (optional)" type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
          <Input label="To date (optional)" type="date" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
        </form>
      </Modal>

      {/* New schedule modal */}
      <Modal
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        title="Schedule a report"
        subtitle="The report is generated automatically on the chosen frequency"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchedOpen(false)}>Cancel</Button>
            <Button onClick={() => createScheduled.mutate()} loading={createScheduled.isPending} disabled={!schedForm.portfolio}>
              Create schedule
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createScheduled.mutate();
          }}
        >
          <div>
            <label className="field-label">Report kind</label>
            <select className="select" value={schedForm.kind} onChange={(e) => setSchedForm((f) => ({ ...f, kind: e.target.value as ReportKind }))}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Format</label>
            <select className="select" value={schedForm.format} onChange={(e) => setSchedForm((f) => ({ ...f, format: e.target.value as ReportFormat }))}>
              {FORMATS.map((fm) => (
                <option key={fm.value} value={fm.value}>{fm.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Portfolio</label>
            <select className="select" value={schedForm.portfolio ?? ''} onChange={(e) => setSchedForm((f) => ({ ...f, portfolio: e.target.value }))}>
              <option value="">Select a portfolio…</option>
              {(portfolios.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Frequency</label>
            <select className="select" value={schedForm.frequency} onChange={(e) => setSchedForm((f) => ({ ...f, frequency: e.target.value }))}>
              {FREQUENCIES.map((fr) => (
                <option key={fr.value} value={fr.value}>{fr.label}</option>
              ))}
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}
