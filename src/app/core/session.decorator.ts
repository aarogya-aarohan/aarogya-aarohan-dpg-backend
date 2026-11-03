import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Practitioner } from '@medplum/fhirtypes';

export const Session = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.session;
  }
);

export type CurrentSession = {
  claims: Record<string, Record<string, unknown>>;
  practitioner?: Practitioner;
};
