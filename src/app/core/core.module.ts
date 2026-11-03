import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FhirClient } from './fhir-client';
import { ClsModule, ClsService } from 'nestjs-cls';
import { FhirCronLock } from './fhir-cron-lock';
import { CONFIG_SCHEMA } from './config-schema';

const CONFIG = ConfigModule.forRoot({
  cache: true,
  expandVariables: true,
  isGlobal: true,
  validationSchema: CONFIG_SCHEMA,
});

const LOGS = LoggerModule.forRoot({
  pinoHttp: {
    autoLogging: false,
    level: 'info',
    redact: {
      paths: ['req.headers.authorization','req.headers.cookie'], // Mask Authorization header
      censor: '[REDACTED]', // Default censor value
    },
  },
});

const CLS = ClsModule.forRoot({ global: true, middleware: { mount: true } });


@Module({
  imports: [CONFIG, LOGS, CLS],
  exports: [LoggerModule, FhirClient, ClsModule, FhirCronLock, ConfigModule],
  providers: [
    FhirCronLock,
    {
      provide: FhirClient,
      useFactory: (config: ConfigService, cls: ClsService) => {
        const fhirUrl = config.get('FHIR_BASE_URL');
        if (!fhirUrl) throw new Error('Not FHIR Url defined');
        const tokenUrl = config.get('FHIR_TOKEN_URL');
        const clientId = config.get('FHIR_CLIENT_ID');
        const clientSecret = config.get('FHIR_CLIENT_SECRET');
        return new FhirClient(fhirUrl, tokenUrl, clientId, clientSecret, cls);
      },
      inject: [ConfigService, ClsService],
    },
  ],
})
export class CoreModule {}
