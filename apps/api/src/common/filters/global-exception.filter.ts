import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationError } from '../errors/application.error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const res = ctx.getResponse<Response>();
    const requestId = req.requestId ?? 'unknown';

    // Ensure X-Request-Id is always on error responses too
    res.setHeader('X-Request-Id', requestId);

    if (exception instanceof ApplicationError) {
      res.status(exception.statusCode).json({
        error: {
          code: exception.code,
          message: exception.message,
          retryable: exception.retryable,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = httpStatusToCode(status);
      res.status(status).json({
        error: {
          code,
          message: exception.message,
          retryable: false,
          requestId,
        },
      });
      return;
    }

    this.logger.error(
      `Unhandled exception [${requestId}]: ${(exception as Error)?.message}`,
      (exception as Error)?.stack,
    );

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        retryable: false,
        requestId,
      },
    });
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'AUTH_REQUIRED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
  }
}
