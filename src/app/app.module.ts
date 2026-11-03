import { Module } from '@nestjs/common';
import { CronScheduleConfigurator } from './core/cron-schedule-configurator';
import { AuthModule } from './auth/auth.module';
import { SiteModule } from './site/site.module';
import { ReaderModule } from './reader/reader.module';
import { ExportModule } from './export/export.module';
import { DiagnosisModule } from './diagnosis/diagnosis.module';
import { CoreModule } from './core/core.module';
import { ScheduleModule } from '@nestjs/schedule';
import { UploadStatusModule } from './upload-status/upload-status.module';

@Module({
  providers: [CronScheduleConfigurator],
  imports: [
    ScheduleModule.forRoot(),
    CoreModule,
    AuthModule,
    SiteModule,
    ReaderModule,
    ExportModule,
    DiagnosisModule,
    UploadStatusModule
  ],
})
export class AppModule {}
