import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Parameters } from '@medplum/fhirtypes';
import { FhirFilter } from '../core/fhir-filter';
import { UserTokenGuard } from '../core/user-token-guard';
import { DiagnosisTaskService } from './phase2/tsd/suspicious/suspicious-task-service';
import { CurrentSession, Session } from '../core/session.decorator';

@Controller('diagnosis')
@UseFilters(new FhirFilter())
export class DiagnosisController {
  constructor(private readonly tasks: DiagnosisTaskService) {}

  @UseGuards(UserTokenGuard)
  @Post('/tasks/submit')
  public submit(@Body() payload: Parameters, @Session() s: CurrentSession) {
    if (!s.practitioner) {
      throw new ForbiddenException(
        'You will need to be logged in as a Practitioner'
      );
    }
    return this.tasks.submit(payload, s.practitioner);
  }
}
