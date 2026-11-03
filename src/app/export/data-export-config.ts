import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DataExportConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    const enabled = this.config.get<boolean | string>('EXPORT_ENABLED');
    return enabled === true || enabled === 'true';
  }

  get siteId() {
    return this.config.get<string>('EXPORT_SITE_ID');
  }

  get fhirUrl() {
    return this.config.get<string>('EXPORT_FHIR_URL');
  }

  get tokenUrl() {
    return this.config.get<string>('EXPORT_TOKEN_URL');
  }

  get clientId() {
    return this.config.get<string>('EXPORT_CLIENT_ID');
  }

  get clientSecret() {
    return this.config.get<string>('EXPORT_CLIENT_SECRET');
  }

  get exportEncounterSystem() {
    return 'http://midas.iisc.ac.in/export-status';
  }

  get exportSiteSystemId() {
    return 'http://midas.iisc.ac.in/site-id';
  }

  get exportStatusCodeFinished() {
    return 'finished';
  }

  get exportStatusCodeFailed() {
    return 'failed';
  }

  get encounterPerCronRun() {
    const KEY = 'EXPORT_PER_CRON_ENCOUNTER';
    return this.config.get<number>(KEY);
  }

  get cronLockMinutes() {
    const KEY = 'EXPORT_CRON_LOCK_MINUTES';
    return this.config.get<number>(KEY);
  }
}
