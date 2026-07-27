import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RequestTracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { requestId: string }>();
    const res = context.switchToHttp().getResponse<Response>();

    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();

    return next
      .handle()
      .pipe(tap(() => res.setHeader('X-Request-Id', req.requestId)));
  }
}
