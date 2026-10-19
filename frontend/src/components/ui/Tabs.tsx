import type { ReactNode } from 'react';
import clsx from 'clsx';

interface Tab {
  key: string;
  label: ReactNode;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={clsx('tabs', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          className={clsx('tab', active !== tab.key && 'tab-active')}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 ? (
            <span
              className="ml-1.5 rounded-full px-1.5 text-[10px] font-semibold"
              style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
            >
              {tab.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
