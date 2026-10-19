import { useQuery } from '@tanstack/react-query';
import { Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { instrumentsApi } from '../../api/endpoints';
import type { Instrument } from '../../api/types';
import { useDebounce } from '../../hooks/useDebounce';
import { parseMoney, signClass } from '../../api/types';

interface InstrumentSearchProps {
  onSelect: (instrument: Instrument) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function InstrumentSearch({ onSelect, placeholder = 'Search instruments…', autoFocus }: InstrumentSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(query, 300);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useQuery({
    queryKey: ['instruments', 'search', debounced],
    queryFn: () => instrumentsApi.list({ search: debounced }),
    enabled: debounced.trim().length >= 1,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = search.data ?? [];

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
        <input
          className="input !pl-9"
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Search instruments"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && debounced.trim().length >= 1 ? (
        <div
          className="absolute z-50 mt-1.5 w-full rounded-xl overflow-hidden card"
          style={{ maxHeight: 320, overflowY: 'auto' }}
          role="listbox"
        >
          {search.isLoading ? (
            <p className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>
              No instruments match “{debounced}”
            </p>
          ) : (
            results.map((inst) => {
              const change = parseMoney(inst.change_pct);
              return (
                <button
                  key={inst.id}
                  role="option"
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:opacity-80 transition-colors border-b last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                  onClick={() => {
                    onSelect(inst);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{inst.symbol}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                      {inst.name}
                    </p>
                  </div>
                  <span className="text-xs capitalize badge" style={{ background: 'var(--surface-2)' }}>
                    {inst.asset_class}
                  </span>
                  <span className={`text-xs font-semibold flex items-center gap-1 ${signClass(change)}`}>
                    {change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {inst.change_pct !== null && inst.change_pct !== undefined ? `${parseMoney(inst.change_pct).toFixed(2)}%` : '—'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
