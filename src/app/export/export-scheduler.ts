import { Injectable } from '@nestjs/common';
import { FhirCronLock } from '../core/fhir-cron-lock';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duration } from 'luxon';
import { DataExportConfig } from './data-export-config';
import { DataExporter } from './data-exporter';

const CRON_EXPORT_ENCOUNTER = 'export-encounter';

@Injectable()
export class ExportScheduler {
  constructor(
    private readonly cronLock: FhirCronLock,
    private readonly tasks: DataExporter,
    private readonly config: DataExportConfig
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: CRON_EXPORT_ENCOUNTER,
  })
  public exportEncounter() {
    if (!this.config.enabled) return;

    return this.cronLock.withLock(
      CRON_EXPORT_ENCOUNTER,
      Duration.fromDurationLike({ minute: this.config.cronLockMinutes }),
      () =>
        this.tasks.processAll({
          count: this.config.encounterPerCronRun,
          chunked: false,
        })
    );
  }
}
