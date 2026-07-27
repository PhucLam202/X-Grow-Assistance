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
    // Use only Vietnamese-exclusive characters: horn letters (ơ ư), breve (ă),
    // stroke (đ), below-diacritic variants, and double-diacritic compounds.
    // Excludes à á è é ì í ò ó ù ú â ê ô which French/Spanish/Italian also use —
    // avoids false-positives from names like "Dembélé" in English posts.
    if (/[ăặằắẳẵơờớợởỡưừứựửữđạảẹẻịỉọỏụủỳýỵỷỹầấậẩẫềếệểễồốộổỗ]/i.test(text)) {
      return 'vi';
    }
    if (/[a-z]/i.test(text)) {
      return 'en';
    }
    return 'unknown';
  }
}
