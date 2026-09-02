import { ReconciliationConfig } from './types';

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  fieldRules: {
    name: 'SOURCE_PRIORITY',
    quantityOnHand: 'FLAG_FOR_REVIEW',
    unitCost: 'LAST_WRITE_WINS',
    location: 'SOURCE_PRIORITY',
  },
  /** Warehouse count (CSV) is ground truth, then partner feed, then legacy system. */
  sourcePriority: ['CSV', 'PARTNER_API', 'LEGACY'],
  tolerance: {
    quantityDelta: 0,
    costDeltaPct: 1,
  },
};

export function withDefaults(partial: Partial<ReconciliationConfig> | undefined): ReconciliationConfig {
  return {
    fieldRules: { ...DEFAULT_RECONCILIATION_CONFIG.fieldRules, ...(partial?.fieldRules ?? {}) },
    sourcePriority: partial?.sourcePriority ?? DEFAULT_RECONCILIATION_CONFIG.sourcePriority,
    tolerance: { ...DEFAULT_RECONCILIATION_CONFIG.tolerance, ...(partial?.tolerance ?? {}) },
  };
}

/**
 * Rank of a source in the priority list (0 = highest trust).
 * Unknown sources rank below every known source.
 */
export function rankOf(source: string | null | undefined, priority: readonly string[]): number {
  if (!source) return priority.length;
  const idx = priority.indexOf(source);
  return idx === -1 ? priority.length : idx;
}
