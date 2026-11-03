import { Injectable } from '@nestjs/common';
import { FhirCronLock } from '../core/fhir-cron-lock';
import { ReaderConfig } from './reader.config';
import { ReaderTaskService } from './reader-task-service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duration } from 'luxon';

const CRON_READER_LABELLING = 'reader-labelling';

@Injectable()
export class ReaderScheduler {
  constructor(
    private readonly cronLock: FhirCronLock,
    private readonly tasks: ReaderTaskService,
    private readonly config: ReaderConfig
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: CRON_READER_LABELLING })
  public scheduleLabelling() {
    if (!this.config.enabled) return;

    return this.cronLock.withLock(
      CRON_READER_LABELLING,
      Duration.fromDurationLike({ minute: this.config.cronLockMinutes }),
      () => this.tasks.createStage1Tasks({ count: this.config.mediaPerCronRun, chunked: false }),
    );
  }
}
