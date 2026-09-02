import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  ok: 'badge-ok',
  warn: 'badge-warn',
  danger: 'badge-danger',
  info: 'badge-info',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{children}</span>;
}
