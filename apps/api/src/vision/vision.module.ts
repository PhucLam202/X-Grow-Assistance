import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LanguageModule } from '../common/language/language.module';
import { ImageModule } from '../image/image.module';
import { VisionController } from './vision.controller';
import { VisionAnalyzeService } from './vision-analyze.service';

@Module({
  imports: [AiModule, ImageModule, LanguageModule],
  controllers: [VisionController],
  providers: [VisionAnalyzeService],
})
export class VisionModule {}
