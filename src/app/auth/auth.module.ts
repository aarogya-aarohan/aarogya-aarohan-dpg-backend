import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthenticatorMiddleware } from './authenticator.middleware';

@Module({
  imports: [ConfigModule],
  providers: [AuthenticatorMiddleware],
  exports: [AuthenticatorMiddleware],
})
export class AuthModule {}