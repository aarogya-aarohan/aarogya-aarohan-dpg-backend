import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { FhirClient } from './fhir-client';
import { ExtractResource, ResourceType } from '@medplum/fhirtypes';
import { DateTime, Duration } from 'luxon';

@Injectable()
export class FhirCronLock implements OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(FhirCronLock.name);
  private readonly systemIdentifier = 'http://midas.iisc.ac.in/cron-lock';
  private readonly resourceType: ResourceType = 'Basic';
  private readonly lockIdentifier = 'cron-lock';

  constructor(
    private readonly source: FhirClient,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  async withLock<T>(
    jobName: string,
    duration: Duration,
    work: () => Promise<T>
  ): Promise<T> {
    let lockAcquired = false;
    try {
      const hasLock = await this.acquireLock(jobName, duration);
      if (!hasLock) {
        this.logger.log('Cron Lock cannot be acquired', { jobName });
        return;
      }
      lockAcquired = true;
      this.logger.log('Lock acquired', { jobName });
      const result = await work();

      // Release the lock when the work is complete
      await this.releaseLock(jobName).catch((e) =>
        this.logger.error('Lock release failure', e)
      );
      this.logger.log('Lock Release', { jobName });

      return result;
    } catch (e) {
      console.error('Error occurred with cron operation', e);
      this.logger.error('Error occurred with cron operation', e, { jobName });
    } finally {
      // Release the lock only if it is acquired
      if (lockAcquired) {
        // Release the lock when there is an error
        await this.releaseLock(jobName).catch((e) =>
          this.logger.error('Lock release failure', e)
        );
        this.logger.log('Finally Lock Release', { jobName });
      }
    }
  }

  async acquireLock(jobName: string, duration: Duration): Promise<boolean> {
    const identifier = `${this.lockIdentifier}-${jobName}`;
    const locks = await this.source.search(this.resourceType, { identifier });

    if (locks && locks.entry && locks.entry.length > 0) {
      const lock = locks.entry[0].resource;
      const lockTimestamp = DateTime.fromISO(lock.meta.lastUpdated);
      if (lockTimestamp.plus(duration) > DateTime.now()) return false;
    }

    const newLock = {
      resourceType: this.resourceType,
      id: this.prepareLockId(jobName),
      identifier: [
        {
          system: this.systemIdentifier,
          value: this.prepareLockId(jobName),
        },
      ],
      meta: { lastUpdated: new Date().toISOString() },
    } as ExtractResource<typeof this.resourceType>;

    await this.source.upsert(newLock);
    return true;
  }

  private prepareLockId(jobName: string) {
    return `${this.lockIdentifier}-${jobName}`;
  }

  async releaseLock(jobName: string) {
    await this.source.delete(this.resourceType, this.prepareLockId(jobName));
  }

  onModuleDestroy() {
    this.releaseAllLock();
  }

  onApplicationShutdown() {
    this.releaseAllLock();
  }

  private releaseAllLock() {
    this.schedulerRegistry.getCronJobs().forEach(async (_, jobName) => {
      await this.releaseLock(jobName);
    });
  }
}
