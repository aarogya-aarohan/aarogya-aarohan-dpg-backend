import { OperationOutcomeIssue } from '@medplum/fhirtypes';
import { OperationOutcomeError } from '@medplum/core';

export function throwOperationOutcome(
  severity: OperationOutcomeIssue['severity'],
  code: OperationOutcomeIssue['code'],
  diagnostics: string
): never {
  throw new OperationOutcomeError({
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity,
        code,
        diagnostics,
      },
    ],
  });
}
