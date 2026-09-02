import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { SourceType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { CsvSource } from './sources/csv.source';
import { PartnerApiSource } from './sources/partner.source';
import { LegacyDbSource } from './sources/legacy.source';
import { RowError } from './sources/source.interface';
import type { ImportBatch } from '@prisma/client';

export interface ImportOptions {
  /** CSV file buffer; required only for CSV source. */
  fileBuffer?: Buffer;
  actor: string;
}

/**
 * Import pipeline orchestrator.
 *
 * One batch = one source. The pipeline is:
 *   create batch -> fetch/parse source -> reconcile (pure engine) ->
 *   persist (transaction) -> finalize batch with counts + row errors.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
    private readonly csv: CsvSource,
    private readonly partner: PartnerApiSource,
    private readonly legacy: LegacyDbSource,
  ) {}

  async runImport(source: SourceType, opts: ImportOptions): Promise<ImportBatch> {
    const batch = await this.prisma.importBatch.create({
      data: { source, triggeredBy: opts.actor, status: 'PENDING' },
    });
    try {
      const errors: RowError[] = [];
      let totalRecords = 0;
      let applied = 0;
      let conflicts = 0;

      if (source === 'CSV') {
        const parsed = this.csv.parse(opts.fileBuffer!);
        if (parsed.records.length === 0) {
          throw new BadRequestException({
            message: 'CSV contained no valid records',
            errors: parsed.errors,
          });
        }
        const counts = await this.reconciliation.runInventoryBatch(
          batch.id,
          source,
          parsed.records,
          opts.actor,
        );
        totalRecords += counts.totalRecords;
        applied += counts.applied;
        conflicts += counts.conflicts;
        errors.push(...parsed.errors);
      } else if (source === 'PARTNER_API') {
        const inv = await this.partner.fetchInventory();
        const counts = await this.reconciliation.runInventoryBatch(
          batch.id,
          source,
          inv.records,
          opts.actor,
        );
        totalRecords += counts.totalRecords;
        applied += counts.applied;
        conflicts += counts.conflicts;
        errors.push(...inv.errors);

        const orders = await this.partner.fetchOrders();
        const orderCounts = await this.reconciliation.runOrderBatch(
          batch.id,
          source,
          orders,
          opts.actor,
        );
        totalRecords += orderCounts.totalRecords;
        applied += orderCounts.applied;
        conflicts += orderCounts.conflicts;
      } else {
        const leg = await this.legacy.fetchInventory();
        const counts = await this.reconciliation.runInventoryBatch(
          batch.id,
          source,
          leg.records,
          opts.actor,
        );
        totalRecords += counts.totalRecords;
        applied += counts.applied;
        conflicts += counts.conflicts;
        errors.push(...leg.errors);
      }

      return await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          totalRecords,
          applied,
          conflicts,
          errors: errors.length > 0 ? (errors as unknown as object) : undefined,
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      await this.prisma.importBatch
        .update({
          where: { id: batch.id },
          data: {
            status: 'FAILED',
            errorMessage: message,
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
      this.logger.warn(`import ${batch.id} (${source}) failed: ${message}`);
      throw err;
    }
  }

  async list(page: number, pageSize: number) {
    const [batches, total] = await Promise.all([
      this.prisma.importBatch.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.importBatch.count(),
    ]);
    return { data: batches, total };
  }

  get(id: string) {
    return this.prisma.importBatch.findUnique({ where: { id } });
  }
}
