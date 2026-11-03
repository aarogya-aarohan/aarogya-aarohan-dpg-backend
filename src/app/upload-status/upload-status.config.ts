import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UploadStatusConfig {
  public readonly enabled: boolean;
  public readonly cronLockMinutes: number;
  public readonly apply: boolean;

  constructor(cfg: ConfigService) {
    this.enabled = cfg.get<boolean>('UPLOAD_STATUS_ENABLED');
    this.cronLockMinutes = cfg.get<number>('UPLOAD_STATUS_CRON_LOCK_MINUTES');
    this.apply = cfg.get<boolean>('UPLOAD_STATUS_APPLY');
  }

  get updateStatus() {
    return "https://midas.iisc.ac.in/fhir/CodeSystem/upload-status";
  }
}
