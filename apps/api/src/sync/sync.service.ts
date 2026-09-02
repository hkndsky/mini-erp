import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { ImportsService } from '../imports/imports.service';

// Background sync jobs (node-cron, no Redis/BullMQ to keep infra light).
//   - PARTNER_SYNC_CRON (default: every 10 min) pulls inventory + orders
//   - LEGACY_SYNC_CRON (default: every 30 min) re-reads the legacy table
// Disabled with SYNC_ENABLED=false (used in tests and e2e to avoid
// background mutations racing the specs).
@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private readonly timers: cron.ScheduledTask[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly imports: ImportsService,
  ) {}

  onModuleInit() {
    if (process.env.SYNC_ENABLED === 'false') {
      this.logger.log('background sync disabled (SYNC_ENABLED=false)');
      return;
    }
    const partnerCron = this.config.get('PARTNER_SYNC_CRON') ?? '*/10 * * * *';
    const legacyCron = this.config.get('LEGACY_SYNC_CRON') ?? '*/30 * * * *';

    if (cron.validate(partnerCron) && cron.validate(legacyCron)) {
      this.timers.push(
        cron.schedule(partnerCron, () => {
          void this.run('PARTNER_API');
        }),
        cron.schedule(legacyCron, () => {
          void this.run('LEGACY');
        }),
      );
      this.logger.log(`scheduled syncs: partner=${partnerCron} legacy=${legacyCron}`);
    } else {
      this.logger.warn('invalid cron expression, background sync disabled');
    }
  }

  onModuleDestroy() {
    for (const t of this.timers) t.stop();
  }

  private run(source: 'PARTNER_API' | 'LEGACY') {
    this.logger.log(`scheduled sync: ${source}`);
    return this.imports
      .runImport(source, { actor: 'scheduler' })
      .then(
        (batch) => this.logger.log(`scheduled sync ${source} done: ${batch.id}`),
        (err: Error) =>
          this.logger.error(`scheduled sync ${source} failed: ${err.message}`),
      );
  }
}
