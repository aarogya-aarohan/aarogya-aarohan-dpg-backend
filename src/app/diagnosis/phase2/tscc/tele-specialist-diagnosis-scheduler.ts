import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { DateTime, Duration } from 'luxon';
import { FhirCronLock } from '../../../core/fhir-cron-lock';
import { DiagnosisConfig } from '../../diagnosis-config';
import { SpecialistTaskService } from './tele-specialist-task-service';

const CRON_SCHEDULE_SPECIALIST_DIAGNOSIS = 'schedule-specialist-diagnosis';

@Injectable()
export class SpecialistDiagnosisScheduler implements OnApplicationBootstrap {
  private readonly log = new Logger(SpecialistDiagnosisScheduler.name);

  constructor(
    private readonly cronLock: FhirCronLock,
    private readonly tasks: SpecialistTaskService,
    private readonly config: DiagnosisConfig,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onApplicationBootstrap() {
    const { resolvedExpression } = this.config.specialistDailyCronSchedule;
    if (resolvedExpression === CronExpression.EVERY_DAY_AT_6PM) return;

    const job = this.schedulerRegistry
      .getCronJobs()
      .get(CRON_SCHEDULE_SPECIALIST_DIAGNOSIS) as any;
    const CronTime = job?.cronTime?.constructor;
    if (!CronTime || typeof job.setTime !== 'function') return;

    job.setTime(new CronTime(resolvedExpression));
    job.start();
  }

  @Cron(CronExpression.EVERY_DAY_AT_6PM, { name: CRON_SCHEDULE_SPECIALIST_DIAGNOSIS })
  public scheduleSpecialistDiagnosis() {
    if (!this.config.enabled) return;

    const startedAt = DateTime.now().toISO() ?? new Date().toISOString();
    const { resolvedExpression } = this.config.specialistDailyCronSchedule;
    this.log.log(
      `Starting specialist diagnosis cron ${CRON_SCHEDULE_SPECIALIST_DIAGNOSIS} at ${startedAt} (schedule=${resolvedExpression})`
    );

    return this.cronLock.withLock(
      CRON_SCHEDULE_SPECIALIST_DIAGNOSIS,
      Duration.fromDurationLike({ minute: this.config.specialistCronLockMinutes }),
      () => this.tasks.process()
    );
  }
}
