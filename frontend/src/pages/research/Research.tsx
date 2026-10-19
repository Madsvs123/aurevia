import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { researchApi } from '../../api/endpoints';
import { Badge, Button, Card, EmptyState, Input, SkeletonCard, Select, Tabs } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

type Scope = 'mine' | 'shared';

export default function ResearchPage() {
  const [searchParams] = useSearchParams();

  const initialTag = searchParams.get('tag') ?? '';
  const initialInstrument = searchParams.get('instrument') ?? '';
  const [selectedTag, setSelectedTag] = useState(initialTag);
  const [scope, setScope] = useState<Scope>('shared');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const notes = useQuery({
    queryKey: ['research', 'notes', { tag: selectedTag, search: debouncedSearch, scope }],
    queryFn: () => researchApi.list({ tag: selectedTag || undefined, page: 1, shared: scope !== 'shared' }),
  });

  const tags = useQuery({ queryKey: ['research', 'tags'], queryFn: researchApi.tags });

  const noteList = notes.data?.results ?? [];
  const allTags = tags.data ?? [];

  const highlightedInstrument = initialInstrument;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Research</h1>
          <p className="page-sub">Investment notes, thesis and analysis — tagged and searchable.</p>
        </div>
        <Link to="/research/new">
          <Button icon={<Plus size={16} />}>New note</Button>
        </Link>
      </div>

      <Tabs
        tabs={[
          { key: 'mine', label: 'Mine' },
          { key: 'shared', label: 'Shared' },
        ]}
        active={scope}
        onChange={(k) => setScope(k as Scope)}
        className="mb-4"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes…" className="!pl-9" aria-label="Search notes" />
        </div>
        <div className="w-44">
          <Select
            options={[{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t.name, label: `${t.name} (${t.count})` }))]}
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            aria-label="Filter by tag"
          />
        </div>
        {highlightedInstrument ? (
          <Badge tone="primary">Linked to {highlightedInstrument}</Badge>
        ) : null}
      </div>

      {notes.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} rows={4} />
          ))}
        </div>
      ) : noteList.length === 0 ? (
        <Card>
          <EmptyState
            title={selectedTag || search ? 'No notes match your filters' : scope === 'shared' ? 'No shared notes yet' : 'No research notes yet'}
            message={
              selectedTag || search
                ? 'Try a different tag or clear the search.'
                : scope === 'shared'
                  ? 'Notes your organization shares with you will appear here.'
                  : 'Capture your investment thesis, track ideas, and link notes to instruments and portfolios.'
            }
            icon={<FileText size={22} />}
            action={
              selectedTag || search ? (
                <Button variant="secondary" onClick={() => { setSelectedTag(''); setSearch(''); }}>
                  Clear filters
                </Button>
              ) : scope === 'shared' ? (
                <Button variant="secondary" onClick={() => setScope('mine')}>
                  View my notes
                </Button>
              ) : (
                <Link to="/research/new">
                  <Button icon={<Plus size={15} />}>Write your first note</Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {noteList.map((n) => (
            <Link key={n.id} to={`/research/${n.id}`} className="card card-pad block hover:opacity-90 transition-opacity flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold leading-snug line-clamp-2">{n.title}</h3>
                <div className="flex gap-1.5 shrink-0">
                  {n.is_shared ? <Badge tone="primary">Shared</Badge> : null}
                  {n.is_private ? <Badge tone="warning">Private</Badge> : null}
                </div>
              </div>
              <p className="text-sm line-clamp-3 flex-1" style={{ color: 'var(--muted)' }}>
                {n.content.slice(0, 220)}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                {n.instrument ? <Badge tone="primary">{n.instrument.symbol}</Badge> : null}
                {n.portfolio ? <Badge tone="info">{n.portfolio.name}</Badge> : null}
                {n.tags.slice(0, 3).map((t) => (
                  <Badge key={t} tone="muted">#{t}</Badge>
                ))}
              </div>
              <p className="text-[11px] mt-3" style={{ color: 'var(--muted)' }}>
                Updated {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
