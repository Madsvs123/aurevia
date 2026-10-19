import { Badge, type BadgeTone } from '../ui/Badge';
import type { InsightKind, Severity } from '../../api/types';

/** Map an insight severity to a badge tone. */
export function severityTone(s: Severity): BadgeTone {
  switch (s) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
      return 'danger';
    default:
      return 'muted';
  }
}

/** Map an insight kind to a badge tone. */
export function kindTone(k: InsightKind): BadgeTone {
  switch (k) {
    case 'rebalance':
    case 'drift':
      return 'primary';
    case 'goal':
      return 'success';
    case 'risk':
    case 'concentration':
    case 'tax':
      return 'warning';
    default:
      return 'info';
  }
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={severityTone(severity)}>{severity}</Badge>;
}

export function KindBadge({ kind }: { kind: InsightKind }) {
  return <Badge tone={kindTone(kind)}>{kind.replace(/_/g, ' ')}</Badge>;
}
