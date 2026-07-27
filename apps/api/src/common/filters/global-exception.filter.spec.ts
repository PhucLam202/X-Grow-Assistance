import { Test } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import supertest from 'supertest';
import { GlobalExceptionFilter } from './global-exception.filter';
import { RequestTracingInterceptor } from '../interceptors/request-tracing.interceptor';
import { ApplicationError } from '../errors/application.error';

@Controller('filter-test')
class FilterTestController {
  @Get('app-error')
  appError() {
    throw new ApplicationError(
      'AI_PROVIDER_TIMEOUT',
      'AI provider did not respond in time.',
      true,
      503,
    );
  }

  @Get('unauthorized')
  unauthorized() {
    throw new UnauthorizedException('Token expired');
  }

  @Get('bad-request')
  badRequest() {
    throw new BadRequestException('Validation failed');
  }

  @Get('not-found')
  notFound() {
    throw new NotFoundException('Resource not found');
  }

  @Get('unknown')
  unknown() {
    throw new Error('Something blew up with secret_api_key=abc123');
  }

  @Get('ok')
  ok() {
    return { success: true };
  }
}

async function buildApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [FilterTestController],
  }).compile();
  const app = module.createNestApplication();
  app.useGlobalInterceptors(new RequestTracingInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}

describe('GlobalExceptionFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps ApplicationError to its code, status and retryable flag', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/app-error',
    );
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_PROVIDER_TIMEOUT');
    expect(res.body.error.retryable).toBe(true);
    expect(res.body.error.message).toBe('AI provider did not respond in time.');
  });

  it('maps UnauthorizedException to 401 with AUTH_REQUIRED code', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/unauthorized',
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('maps BadRequestException to 400', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/bad-request',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('maps NotFoundException to 404', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/not-found',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('unknown error returns 500 without stack trace or secrets', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/unknown',
    );
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.retryable).toBe(false);
    // Must not expose internals
    expect(JSON.stringify(res.body)).not.toContain('secret_api_key');
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  it('every error response has a requestId', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/unauthorized',
    );
    expect(res.body.error.requestId).toBeDefined();
  });

  it('requestId in response matches X-Request-Id header', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/filter-test/unauthorized',
    );
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('success response is not affected by the filter', async () => {
    const res = await supertest(app.getHttpServer()).get('/filter-test/ok');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
