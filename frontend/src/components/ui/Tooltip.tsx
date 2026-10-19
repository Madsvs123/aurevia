import { useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 350);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setVisible(false);
  };

  const sidePos: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <span className={clsx('relative inline-flex', className)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible ? (
        <span
          role="tooltip"
          className={clsx('absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium', sidePos[side])}
          style={{ background: 'var(--text)', color: 'var(--bg)' }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
