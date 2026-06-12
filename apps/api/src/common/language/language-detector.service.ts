import { Injectable } from '@nestjs/common';
import { DetectedLanguage } from './language.types';

@Injectable()
export class LanguageDetectorService {
  detect(text: string): DetectedLanguage {
    if (/[\u3040-\u30ff]/.test(text)) {
      return 'ja';
    }
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko';
    }
    if (/[\u3400-\u9fff]/.test(text)) {
      return 'zh';
    }
    if (
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
        text,
      )
    ) {
      return 'vi';
    }
    if (/[a-z]/i.test(text)) {
      return 'en';
    }
    return 'unknown';
  }
}
