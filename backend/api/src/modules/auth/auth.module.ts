import { Module } from '@nestjs/common';

import { AuthGuard } from './auth.guard.js';
import { AuthResolver } from './auth.resolver.js';
import { AuthService } from './auth.service.js';

@Module({ providers: [AuthService, AuthGuard, AuthResolver], exports: [AuthService, AuthGuard] })
export class AuthModule {}
