import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CsvSource } from './sources/csv.source';
import { PartnerApiSource } from './sources/partner.source';
import { LegacyDbSource } from './sources/legacy.source';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
  imports: [ReconciliationModule],
  controllers: [ImportsController],
  providers: [ImportsService, CsvSource, PartnerApiSource, LegacyDbSource],
  exports: [ImportsService],
})
export class ImportsModule {}
