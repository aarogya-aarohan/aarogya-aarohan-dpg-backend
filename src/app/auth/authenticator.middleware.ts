import jwks, { JwksClient } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Session } from './session';

@Injectable()
export class AuthenticatorMiddleware implements NestMiddleware {
  private readonly client: JwksClient;

  constructor(readonly config: ConfigService) {
    this.client = jwks({ jwksUri: config.get('AUTH_JWKS_URI') });
  }

  async use(req: Request, _: Response, next: NextFunction) {
    const token = this.extractToken(req);
    // Update the session
    req['session'] = token
      ? await this.performBearer(token)
      : Session.notAttempted();
    next();
  }

  private extractToken(req: Request) {
    const authHeader = req.headers.authorization;
    const hasToken = authHeader?.split(' ')[0]?.toLowerCase() === 'bearer';
    return hasToken ? authHeader.split(' ')[1] : null;
  }

  async performBearer(token: string) {
    try {
      const k = await this.getKey();
      const payload = jwt.verify(token, k.getPublicKey()) as JwtPayload;
      return Session.authenticated(token, payload);
    } catch (e) {
      console.error('Authentication failed', e);
      return Session.failed();
    }
  }

  private async getKey() {
    return await this.client.getSigningKey();
  }
}
