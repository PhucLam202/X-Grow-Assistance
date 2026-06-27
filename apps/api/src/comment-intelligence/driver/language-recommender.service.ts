import { Injectable } from '@nestjs/common';
import { LanguageDetectorService } from '../../common/language/language-detector.service';
import { DriverInput } from '../types/comment-intelligence.types';

@Injectable()
export class LanguageRecommenderService {
  constructor(private readonly languageDetector: LanguageDetectorService) {}

  recommend(input: DriverInput): string {
    if (input.mainPost.language && input.mainPost.language !== 'unknown') {
      return input.mainPost.language;
    }
    const text = [
      input.mainPost.text,
      input.quotedPost?.text,
      input.parentPost?.text,
    ]
      .filter(Boolean)
      .join(' ');
    return this.languageDetector.detect(text);
  }
}
