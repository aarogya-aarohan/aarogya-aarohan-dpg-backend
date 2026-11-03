import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

const CONFIGURED_JOBS = {
  DIAGNOSIS_PHASE1_CRON_EXPRESSION: 'schedule-phase1-diagnosis',
  DIAGNOSIS_SUSPICIOUS_CRON_EXPRESSION: 'schedule-diagnosis',
  READER_CRON_EXPRESSION: 'reader-labelling',
  UPLOAD_STATUS_CRON_EXPRESSION: 'upload-status',
  EXPORT_CRON_EXPRESSION: 'export-encounter',
} as const;

@Injectable()
export class CronScheduleConfigurator implements OnApplicationBootstrap {
  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry
  ) {}

  onApplicationBootstrap() {
    // Nest mounts decorated jobs before the root module's bootstrap hooks.
    // Validate all overrides before changing any of the registered schedules.
    const overrides = Object.entries(CONFIGURED_JOBS).flatMap(([key, name]) => {
      const expression = this.config.get<string>(key)?.trim();
      if (!expression) return [];

      const job = this.registry.getCronJob(name);
      // Use the same cron library instance as Nest, without a new dependency.
      const CronTime = job.cronTime.constructor as new (
        expression: string
      ) => typeof job.cronTime;
      try {
        return [{ job, time: new CronTime(expression) }];
      } catch (error) {
        throw new Error(
          `Invalid ${key}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    for (const { job, time } of overrides) {
      job.setTime(time);
    }
  }
}
