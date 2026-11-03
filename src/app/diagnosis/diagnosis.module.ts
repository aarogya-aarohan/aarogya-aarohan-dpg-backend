import { Module } from '@nestjs/common';
import { DiagnosisController } from './diagnosis.controller';
import { DiagnosisTaskService } from './phase2/tsd/suspicious/suspicious-task-service';
import { CoreModule } from '../core/core.module';
import { DiagnosisConfig } from './diagnosis-config';
import { DiagnosisScheduler } from './phase2/tsd/suspicious/suspicious-diagnosis-scheduler';
import { NonSuspiciousTaskService } from './phase2/tsd/nonsuspicious/nonsuspicious-task-service';
import { NonSuspiciousDiagnosisScheduler } from './phase2/tsd/nonsuspicious/nonsuspicious-diagnosis-scheduler';
import { DiagnosisSharedService } from './diagnosis-shared.service';
import { SpecialistDiagnosisScheduler } from './phase2/tscc/tele-specialist-diagnosis-scheduler';
import { SpecialistTaskService } from './phase2/tscc/tele-specialist-task-service';
import { SpecialistDiagnosisScheduler as Phase1SpecialistDiagnosisScheduler } from './phase1/specialist-diagnosis-scheduler';
import { SpecialistDiagnosisTaskService } from './phase1/specialist-diagnosis-task-service';

@Module({
  controllers: [DiagnosisController],
  providers: [
    DiagnosisTaskService,
    DiagnosisConfig,
    DiagnosisSharedService,
    DiagnosisScheduler,
    NonSuspiciousTaskService,
    NonSuspiciousDiagnosisScheduler,
    SpecialistTaskService,
    SpecialistDiagnosisScheduler,
    SpecialistDiagnosisTaskService,
    Phase1SpecialistDiagnosisScheduler,
  ],
  imports: [CoreModule],
})
export class DiagnosisModule {}
