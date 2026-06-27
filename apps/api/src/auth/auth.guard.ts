import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthUser } from './types/auth-user.type';

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.authService.verifyBearerToken(request.headers.authorization);
    return true;
  }
}
