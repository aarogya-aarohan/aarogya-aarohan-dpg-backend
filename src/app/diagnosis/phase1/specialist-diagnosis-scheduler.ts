import { Injectable } from '@nestjs/common';
import { FhirCronLock } from '../../core/fhir-cron-lock';
import { SpecialistDiagnosisTaskService } from './specialist-diagnosis-task-service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duration } from 'luxon';
import { DiagnosisConfig } from '../diagnosis-config';

const CRON_SCHEDULE_PHASE1_DIAGNOSIS = 'schedule-phase1-diagnosis';

@Injectable()
export class SpecialistDiagnosisScheduler {
  constructor(
    private readonly cronLock: FhirCronLock,
    private readonly tasks: SpecialistDiagnosisTaskService,
    private readonly config: DiagnosisConfig
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: CRON_SCHEDULE_PHASE1_DIAGNOSIS })
  public scheduleDiagnosis() {
    if (!this.config.enabled) return;

    return this.cronLock.withLock(
      CRON_SCHEDULE_PHASE1_DIAGNOSIS,
      Duration.fromDurationLike({ minute: this.config.cronLockMinutes }),
      () =>
        this.tasks.processAll({
          count: this.config.encounterPerCronRun,
          chunked: true,
        })
    );
  }
}
