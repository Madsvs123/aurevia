import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Plus, Save, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { portfoliosApi, researchApi } from '../../api/endpoints';
import type { ResearchNotePayload } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, SkeletonCard, Toggle } from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

/** Markdown-ish rendering: bold, italics, headings, lists, code blocks. */
function renderMarkdownish(content: string): React.ReactNode {
  const lines = content.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  const flushList = (key: string) => {
    if (list) {
      out.push(
        <ul key={key} className="list-disc pl-5 space-y-0.5 my-2">
          {list.map((li, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inline(li) }} />
          ))}
        </ul>,
      );
      list = null;
    }
  };

  const inline = (s: string): string =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--surface-2);padding:1px 4px;border-radius:4px;font-size:12px">$1</code>');

  lines.forEach((line, i) => {
    const key = `l${i}`;
    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push(
          <pre key={key} className="rounded-lg p-3 my-2 overflow-x-auto text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {codeLines.join('\n')}
          </pre>,
        );
        codeLines = [];
        inCode = false;
      } else {
        flushList(`${key}-list`);
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList(`${key}-list`);
      const level = heading[1].length;
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      out.push(
        <Tag key={key} className="font-semibold mt-3 mb-1 first:mt-0" dangerouslySetInnerHTML={{ __html: inline(heading[2]) }} />,
      );
      return;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      list = list ?? [];
      list.push(bullet[1]);
      return;
    }
    flushList(`${key}-list`);
    if (line.trim() === '') {
      out.push(<div key={key} className="h-2" />);
    } else {
      out.push(
        <p key={key} className="my-1" dangerouslySetInnerHTML={{ __html: inline(line) }} />,
      );
    }
  });
  flushList('final-list');
  if (inCode) {
    out.push(
      <pre key="code-end" className="rounded-lg p-3 my-2 overflow-x-auto text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {codeLines.join('\n')}
      </pre>,
    );
  }
  return out;
}

export default function ResearchNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ResearchNotePayload>({ title: '', content: '', tags: [], is_private: false, is_shared: false, instrument: null, portfolio: null });
  const [tagInput, setTagInput] = useState('');
  const [initialized, setInitialized] = useState(false);

  const note = useQuery({
    queryKey: ['research', 'note', id],
    queryFn: () => researchApi.detail(id as string),
    enabled: Boolean(id) && !isNew,
  });

  const portfolios = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
    enabled: isNew,
  });

  const tags = useQuery({ queryKey: ['research', 'tags'], queryFn: researchApi.tags });

  // Seed the form once the note loads.
  useEffect(() => {
    if (note.data && !initialized && !isNew) {
      setForm({
        title: note.data.title,
        content: note.data.content,
        tags: note.data.tags,
        is_private: note.data.is_private,
        is_shared: note.data.is_shared,
        instrument: note.data.instrument?.id ?? null,
        portfolio: note.data.portfolio?.id ?? null,
      });
      setInitialized(true);
    }
  }, [note.data, initialized, isNew]);

  const save = useMutation({
    mutationFn: () => {
      if (isNew) return researchApi.create(form);
      return researchApi.patch(id as string, form);
    },
    onSuccess: (saved) => {
      toastSuccess(isNew ? 'Note created' : 'Note saved');
      void queryClient.invalidateQueries({ queryKey: ['research'] });
      if (!isNew) navigate(`/research/${saved.id}`, { replace: true });
    },
    onError: (err) => toastError('Save failed', apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => researchApi.remove(id as string),
    onSuccess: () => {
      toastSuccess('Note deleted');
      void queryClient.invalidateQueries({ queryKey: ['research'] });
      navigate('/research');
    },
    onError: (err) => toastError('Delete failed', apiErrorMessage(err)),
  });

  const upload = useMutation({
    mutationFn: (file: File) => researchApi.uploadAttachment(id as string, file),
    onSuccess: () => {
      toastSuccess('Attachment uploaded');
      void queryClient.invalidateQueries({ queryKey: ['research', 'note', id] });
    },
    onError: (err) => toastError('Upload failed', apiErrorMessage(err)),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => researchApi.deleteAttachment(attachmentId),
    onSuccess: () => {
      toastSuccess('Attachment removed');
      void queryClient.invalidateQueries({ queryKey: ['research', 'note', id] });
    },
    onError: (err) => toastError('Remove failed', apiErrorMessage(err)),
  });

  const loading = !isNew && note.isLoading;
  const data = note.data;

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !form.tags?.includes(t)) {
      setForm((f) => ({ ...f, tags: [...(f.tags ?? []), t] }));
    }
    setTagInput('');
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/research" className="link text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> All notes
        </Link>
        <div className="flex gap-2">
          {!isNew ? (
            <>
              <Button variant="danger" size="sm" onClick={() => { if (window.confirm('Delete this note permanently?')) remove.mutate(); }} icon={<Trash2 size={14} />}>
                Delete
              </Button>
              <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} icon={<Save size={14} />}>
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!form.title.trim()} icon={<Save size={14} />}>
              Create note
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonCard rows={8} />
      ) : !data && !isNew ? (
        <Card>
          <EmptyState title="Note not found" message="It may have been deleted." action={<Link to="/research"><Button variant="secondary" size="sm">Back to research</Button></Link>} />
        </Card>
      ) : (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {data ? (
                <>
                  <Badge tone="primary">{data.instrument ? data.instrument.symbol : 'General'}</Badge>
                  {data.is_shared ? <Badge tone="primary">Shared</Badge> : null}
                  {data.is_private ? <Badge tone="warning">Private</Badge> : null}
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    Updated {format(new Date(data.updated_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </>
              ) : (
                <Badge tone="info">Draft</Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Toggle checked={form.is_shared ?? false} onChange={(v) => setForm((f) => ({ ...f, is_shared: v }))} label="Shared" size="sm" />
              <Toggle checked={form.is_private ?? false} onChange={(v) => setForm((f) => ({ ...f, is_private: v }))} label="Private" size="sm" />
            </div>
          </div>

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Note title — e.g. AAPL thesis update"
            className="!text-lg !font-semibold"
          />

          <div>
            <label className="field-label">Content (markdown-ish: **bold**, *italic*, `code`, # headings, - lists)</label>
            <textarea
              className="textarea min-h-[220px] font-mono !text-[13px] leading-relaxed"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder={'# Thesis\n\n**Why I like this company:**\n- Strong cash flow\n- Wide moat\n\n`symbol: AAPL`'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Linked instrument (optional)</label>
              <Input
                value={form.instrument ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, instrument: e.target.value || null }))}
                placeholder="Instrument id or symbol — e.g. AAPL"
              />
            </div>
            <div>
              <label className="field-label">Linked portfolio (optional)</label>
              <select
                className="select"
                value={form.portfolio ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, portfolio: e.target.value || null }))}
              >
                <option value="">None</option>
                {(portfolios.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {data?.portfolio ? <option value={data.portfolio.id}>{data.portfolio.name}</option> : null}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">Tags</label>
            <div className="flex flex-wrap items-center gap-2">
              {(form.tags ?? []).map((t) => (
                <span key={t} className="chip chip-active">
                  #{t}
                  <button onClick={() => setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((x) => x !== t) }))} aria-label={`Remove tag ${t}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1.5">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add tag…"
                  className="!w-32"
                  aria-label="Add tag"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addTag} icon={<Plus size={13} />}>
                  Add
                </Button>
              </div>
            </div>
            {tags.data && tags.data.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.data.map((t) => (
                  <button key={t.name} className="chip" onClick={() => { if (!form.tags?.includes(t.name)) setForm((f) => ({ ...f, tags: [...(f.tags ?? []), t.name] })); }}>
                    #{t.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {!isNew ? (
            <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="field-label !mb-0">Attachments</label>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} icon={<Paperclip size={13} />}>
                  Upload file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload.mutate(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {(note.data?.attachments ?? []).length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Upload PDFs, images or spreadsheets to support the note.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(note.data?.attachments ?? []).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                    >
                      <a
                        href={a.file}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                        title={a.filename ?? a.id}
                      >
                        {a.filename ?? 'Attachment'}
                      </a>
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        className="shrink-0"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => deleteAttachment.mutate(a.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Preview */}
      {form.content.trim() ? (
        <Card>
          <CardHeader title="Preview" />
          <div className="text-sm leading-relaxed">{renderMarkdownish(form.content)}</div>
        </Card>
      ) : null}
    </div>
  );
}
