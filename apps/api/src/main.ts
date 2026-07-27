import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RequestTracingInterceptor } from './common/interceptors/request-tracing.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validationExceptionFactory } from './common/validation/validation-error.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = Number(configService.get<string>('PORT', '3001'));
  const host = configService.get<string>('HOST', '127.0.0.1');
  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:3000,chrome-extension://your_extension_id',
  );

  app.setGlobalPrefix('api/v1');
  app.useGlobalInterceptors(new RequestTracingInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.enableCors({
    origin: corsOrigin.split(','),
  });

  await app.listen(port, host);
}
void bootstrap();
