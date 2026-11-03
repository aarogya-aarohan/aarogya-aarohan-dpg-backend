import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { FhirClient } from './fhir-client';

@Injectable()
export class UserTokenGuard implements CanActivate {
  private readonly logger = new Logger(UserTokenGuard.name);

  constructor(
    private readonly cls: ClsService,
    private readonly source: FhirClient
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['authorization'];
    if (!header) throw new ForbiddenException('Unauthorized');
    const token = header.split(' ')[1];
    this.cls.set('userToken', token);
    const claims = this.extractClaims(token);
    request['session'] = {
      claims,
      practitioner: await this.getPractitionerDetail(token),
    };
    return true;
  }

  private extractClaims(token: string) {
    const body = token.split('.')?.[1];
    if (!body) throw new ForbiddenException('Unauthorized');
    try {
      return JSON.parse(
        Buffer.from(body, 'base64').toString('utf-8')
      ) as Record<string, string>;
    } catch (e) {
      this.logger.error('Failed to parse token body', e);
      throw new ForbiddenException('Unauthorized');
    }
  }

  private async getPractitionerDetail(token: string) {
    const identifier = this.extractClaims(token)?.sub;
    if (!identifier) throw new ForbiddenException('Unauthorized');

    try {
      const bundle = await this.source.search('Practitioner', { identifier });
      return bundle.entry?.map((e) => e.resource)?.[0];
    } catch (e) {
      this.logger.error('Cannot find practitionerDetail', e);
      return;
    }
  }
}
