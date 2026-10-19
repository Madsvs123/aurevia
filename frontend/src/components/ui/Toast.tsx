import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '../../store/toast';

const kindConfig: Record<
  ToastKind,
  { icon: typeof Info; color: string; bg: string; label: string }
> = {
  success: { icon: CheckCircle2, color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 10%, transparent)', label: 'Success' },
  error: { icon: AlertCircle, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 10%, transparent)', label: 'Error' },
  info: { icon: Info, color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 10%, transparent)', label: 'Info' },
  warning: { icon: AlertTriangle, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 10%, transparent)', label: 'Warning' },
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)]" role="region" aria-live="polite">
      {toasts.map((t) => {
        const cfg = kindConfig[t.kind];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className="card card-pad !p-4 flex items-start gap-3 animate-toast-in"
            role="alert"
          >
            <span
              className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
              style={{ width: 28, height: 28, color: cfg.color, background: cfg.bg }}
            >
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.message ? (
                <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--muted)' }}>
                  {t.message}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="btn btn-ghost btn-sm !px-1 !py-0.5 shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
