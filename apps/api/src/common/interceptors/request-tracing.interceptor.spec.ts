import { Test } from '@nestjs/testing';
import { INestApplication, Controller, Get, UseGuards } from '@nestjs/common';
import supertest from 'supertest';
import { RequestTracingInterceptor } from './request-tracing.interceptor';

@Controller('tracing-test')
class TracingTestController {
  @Get()
  ping() {
    return { ok: true };
  }
}

async function buildApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [TracingTestController],
  }).compile();
  const app = module.createNestApplication();
  app.useGlobalInterceptors(new RequestTracingInterceptor());
  await app.init();
  return app;
}

describe('RequestTracingInterceptor', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a request ID when none is provided', async () => {
    const res = await supertest(app.getHttpServer()).get('/tracing-test');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves a valid X-Request-Id sent by client', async () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await supertest(app.getHttpServer())
      .get('/tracing-test')
      .set('x-request-id', clientId);
    expect(res.headers['x-request-id']).toBe(clientId);
  });

  it('response always contains X-Request-Id', async () => {
    const res = await supertest(app.getHttpServer()).get('/tracing-test');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('two requests have different generated IDs', async () => {
    const [r1, r2] = await Promise.all([
      supertest(app.getHttpServer()).get('/tracing-test'),
      supertest(app.getHttpServer()).get('/tracing-test'),
    ]);
    expect(r1.headers['x-request-id']).not.toBe(r2.headers['x-request-id']);
  });
});
