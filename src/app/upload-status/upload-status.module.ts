import { Module } from '@nestjs/common';
import { UploadStatusScheduler } from './upload-status.scheduler';
import { UploadStatusService } from './upload-status.service';
import { UploadStatusConfig } from './upload-status.config';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [UploadStatusConfig, UploadStatusService, UploadStatusScheduler],
})
export class UploadStatusModule {}
