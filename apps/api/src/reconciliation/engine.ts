import {
  ConflictCandidate,
  ExistingInventorySnapshot,
  FieldApplication,
  INVENTORY_FIELDS,
  InventoryField,
  NormalizedInventoryRecord,
  ReconciliationConfig,
  ReconciliationOutcome,
  SOURCE_TYPES,
  SkippedField,
  SourceType,
  withDefaults,
  rankOf,
} from '@erp/shared';

export interface ReconcileInventoryParams {
  /** All records in this call come from the same source (one batch = one source). */
  source: SourceType;
  records: NormalizedInventoryRecord[];
  existing: Map<string, ExistingInventorySnapshot>;
  config?: Partial<ReconciliationConfig>;
}

function recordValue(rec: NormalizedInventoryRecord, field: InventoryField): string | number | null {
  switch (field) {
    case 'name':
      return rec.name ?? null;
    case 'quantityOnHand':
      return rec.quantityOnHand ?? null;
    case 'unitCost':
      return rec.unitCost ?? null;
    case 'location':
      return rec.location ?? null;
  }
}

function existingValue(ex: ExistingInventorySnapshot, field: InventoryField): string | number | null {
  return ex[field];
}

function isNumericField(field: InventoryField): boolean {
  return field === 'quantityOnHand' || field === 'unitCost';
}

function valuesEqual(field: InventoryField, a: string | number | null, b: string | number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (isNumericField(field)) return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

function withinTolerance(
  field: InventoryField,
  a: string | number | null,
  b: string | number | null,
  config: ReconciliationConfig,
): boolean {
  if (a === null || b === null || !isNumericField(field)) return false;
  const prev = Number(a);
  const next = Number(b);
  if (field === 'quantityOnHand') return Math.abs(next - prev) <= config.tolerance.quantityDelta;
  // cost: relative percentage delta (prev = 0 treated as absolute)
  if (prev === 0) return Math.abs(next) <= config.tolerance.costDeltaPct / 100;
  const pct = (Math.abs(next - prev) / Math.abs(prev)) * 100;
  return pct <= config.tolerance.costDeltaPct;
}

function fmt(v: string | number | null): string | null {
  return v === null ? null : String(v);
}

function toNum(v: string | number | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure reconciliation engine for inventory records.
 *
 * For every (sku, field) pair where incoming != current:
 *  - change within tolerance  -> skipped (silently absorbed)
 *  - rule LAST_WRITE_WINS     -> always apply
 *  - rule SOURCE_PRIORITY     -> apply only if the incoming source is at least
 *                                as trusted as the source that last wrote the
 *                                value; otherwise a conflict is raised
 *  - rule FLAG_FOR_REVIEW     -> always raise a conflict (never auto-applied)
 *
 * Unknown SKUs are reported in `newSkus` for the caller to create.
 */
export function reconcileInventory(params: ReconcileInventoryParams): ReconciliationOutcome {
  const config = withDefaults(params.config);
  const outcome: ReconciliationOutcome = {
    applications: [],
    conflicts: [],
    skipped: [],
    newSkus: [],
  };

  for (const rec of params.records) {
    const existing = params.existing.get(rec.sku);
    if (!existing) {
      if (!outcome.newSkus.includes(rec.sku)) outcome.newSkus.push(rec.sku);
      continue;
    }

    for (const field of INVENTORY_FIELDS) {
      const next = recordValue(rec, field);
      const prev = existingValue(existing, field);

      if (next === null) continue; // this source did not carry the field
      if (valuesEqual(field, prev, next)) continue; // nothing changed
      if (withinTolerance(field, prev, next, config)) {
        outcome.skipped.push({ sku: rec.sku, field, source: params.source, reason: 'within_tolerance' });
        continue;
      }

      const rule = config.fieldRules[field];
      const base = {
        sku: rec.sku,
        field,
        previous: fmt(prev),
        next: fmt(next),
        previousNum: toNum(prev),
        nextNum: toNum(next),
        source: params.source,
      };

      if (rule === 'LAST_WRITE_WINS') {
        outcome.applications.push({ ...base, rule });
      } else if (rule === 'SOURCE_PRIORITY') {
        const prevRank = rankOf(existing.lastSource, config.sourcePriority);
        const nextRank = rankOf(params.source, config.sourcePriority);
        if (prevRank > nextRank) {
          // incoming source is more trusted (or current source is unknown)
          outcome.applications.push({ ...base, rule });
        } else {
          outcome.conflicts.push({
            ...base,
            reason:
              nextRank > prevRank
                ? `source priority: incoming ${params.source} (rank ${nextRank + 1}) is less trusted than current ${existing.lastSource} (rank ${prevRank + 1})`
                : `source priority: ${params.source} and ${existing.lastSource} have equal rank and disagree`,
          });
        }
      } else {
        outcome.conflicts.push({
          ...base,
          reason: `${field} differs (current ${fmt(prev)} vs incoming ${fmt(next)}) and rule is FLAG_FOR_REVIEW`,
        });
      }
    }
  }

  return outcome;
}

export function assertValidSourceType(source: string): asserts source is SourceType {
  if (!(SOURCE_TYPES as readonly string[]).includes(source)) {
    throw new Error(`Unknown source type: ${source}`);
  }
}
