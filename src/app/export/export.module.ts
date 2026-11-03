import { Module } from '@nestjs/common';
import { DataExporter } from './data-exporter';
import { DataExportConfig } from './data-export-config';
import { CoreModule } from '../core/core.module';
import { FhirClient } from '../core/fhir-client';
import { ClsService } from 'nestjs-cls';
import { ExportScheduler } from './export-scheduler';

@Module({
  imports: [CoreModule],
  providers: [
    DataExportConfig,
    {
      provide: 'EXPORT_FHIR_CLIENT',
      useFactory: (dataConfig: DataExportConfig, cls: ClsService) => {
        return new FhirClient(
          dataConfig.fhirUrl,
          dataConfig.tokenUrl,
          dataConfig.clientId,
          dataConfig.clientSecret,
          cls
        );
      },
      inject: [DataExportConfig, ClsService],
    },
    DataExporter,
    ExportScheduler,
  ],
})
export class ExportModule {}
