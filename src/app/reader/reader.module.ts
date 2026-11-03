import { Module } from '@nestjs/common';
import { ReaderController } from './reader.controller';
import { ReaderAnalyticsController } from './reader-analytics.controller';
import { ReaderGroupService } from './reader-group.service';
import { CoreModule } from '../core/core.module';
import { ReaderConfig } from './reader.config';
import { ReaderTaskService } from './reader-task-service';
import { ReaderScheduler } from './reader-scheduler';
import { AiInferenceService } from './ai-inference.service';
import { ReaderAnalyticsService } from './reader-analytics.service';

@Module({
  controllers: [ReaderController, ReaderAnalyticsController],
  imports: [CoreModule],
  providers: [
    ReaderTaskService,
    ReaderGroupService,
    ReaderConfig,
    ReaderScheduler,
    AiInferenceService,
    ReaderAnalyticsService,
  ],
})
export class ReaderModule {}
