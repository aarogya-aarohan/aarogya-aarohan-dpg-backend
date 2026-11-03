import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { DateTime, Duration } from 'luxon';
import { FhirCronLock } from '../../../../core/fhir-cron-lock';
import { DiagnosisConfig } from '../../../diagnosis-config';
import { NonSuspiciousTaskService } from './nonsuspicious-task-service';

const CRON_SCHEDULE_NON_SUSPICIOUS = 'schedule-non-suspicious-diagnosis';

@Injectable()
export class NonSuspiciousDiagnosisScheduler implements OnApplicationBootstrap {
  private readonly log = new Logger(NonSuspiciousDiagnosisScheduler.name);

  constructor(
    private readonly cronLock: FhirCronLock,
    private readonly tasks: NonSuspiciousTaskService,
    private readonly config: DiagnosisConfig,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onApplicationBootstrap() {
    const { resolvedExpression } = this.config.nonSuspiciousDailyCronSchedule;
    if (resolvedExpression === CronExpression.EVERY_DAY_AT_6PM) return;

    const job = this.schedulerRegistry
      .getCronJobs()
      .get(CRON_SCHEDULE_NON_SUSPICIOUS) as any;
    const CronTime = job?.cronTime?.constructor;
    if (!CronTime || typeof job.setTime !== 'function') return;

    job.setTime(new CronTime(resolvedExpression));
    job.start();
  }

  @Cron(CronExpression.EVERY_DAY_AT_6PM, { name: CRON_SCHEDULE_NON_SUSPICIOUS })
  public scheduleNonSuspicious() {
    if (!this.config.enabled) return;

    const startedAt = DateTime.now().toISO() ?? new Date().toISOString();
    const { resolvedExpression } = this.config.nonSuspiciousDailyCronSchedule;
    this.log.log(
      `Starting non-suspicious diagnosis cron ${CRON_SCHEDULE_NON_SUSPICIOUS} at ${startedAt} (schedule=${resolvedExpression})`
    );

    return this.cronLock.withLock(
      CRON_SCHEDULE_NON_SUSPICIOUS,
      Duration.fromDurationLike({ minute: this.config.nonSuspiciousCronLockMinutes }),
      () => this.tasks.process()
    );
  }
}
