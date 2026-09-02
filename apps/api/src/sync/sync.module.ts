import { Module, forwardRef } from '@nestjs/common';
import { SyncService } from './sync.service';
import { ImportsModule } from '../imports/imports.module';

@Module({
  imports: [ImportsModule],
  providers: [SyncService],
})
export class SyncModule {}
