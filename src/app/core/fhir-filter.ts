import { ArgumentsHost, Catch } from '@nestjs/common';
import { OperationOutcomeError } from '@medplum/core';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';

@Catch(OperationOutcomeError)
export class FhirFilter extends BaseExceptionFilter<OperationOutcomeError> {
  catch(exception: OperationOutcomeError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.status(400).json(exception.outcome);
  }
}
