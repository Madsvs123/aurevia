import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnBackdrop?: boolean;
}

const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={clsx('modal-panel', sizeClass[size])}>
        <div className="flex items-start justify-between gap-4 p-5 pb-0">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle ? (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm !px-1.5"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-0">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
