import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { ReplyPackModule } from './reply-pack/reply-pack.module';
import { VisionModule } from './vision/vision.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AnalyticsModule,
    ReplyPackModule,
    VisionModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
