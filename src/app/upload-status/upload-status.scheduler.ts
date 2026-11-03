import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duration } from 'luxon';
import { FhirCronLock } from '../core/fhir-cron-lock';
import { UploadStatusService } from './upload-status.service';
import { UploadStatusConfig } from './upload-status.config';

const CRON_NAME = 'upload-status';

@Injectable()
export class UploadStatusScheduler {
  constructor(
    private readonly lock: FhirCronLock,
    private readonly svc: UploadStatusService,
    private readonly cfg: UploadStatusConfig,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: CRON_NAME })
  async runEveryMinute() {
    if (!this.cfg.enabled) return;

    return this.lock.withLock(
      CRON_NAME,
      Duration.fromObject({ minute: this.cfg.cronLockMinutes }),
      async () => {
        const encounters = await this.svc.fetchAllEncounters();
        if (encounters.length === 0) {
          console.log('upload-status: no encounters');
          return;
        }
        await this.svc.evaluateAndApply(encounters);
      },
    );
  }
}
