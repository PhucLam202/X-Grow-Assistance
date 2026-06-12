import { Module } from '@nestjs/common';
import { LanguageDetectorService } from './language-detector.service';

@Module({
  providers: [LanguageDetectorService],
  exports: [LanguageDetectorService],
})
export class LanguageModule {}
