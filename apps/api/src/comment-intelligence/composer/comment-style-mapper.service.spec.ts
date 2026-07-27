import { LanguageDetectorService } from '../../common/language/language-detector.service';
import { CommentStyleMapperService } from './comment-style-mapper.service';

function makeInput(text: string, language: string) {
  return {
    mainPost: { text, language, username: '', authorName: '', url: '' },
  } as any;
}

function makeDecision(recommendedLanguage = '') {
  return {
    recommendedLanguage,
    recommendedDepth: 'short',
    zone: 'general',
  } as any;
}

describe('CommentStyleMapperService.toTargetLanguage', () => {
  let mapper: CommentStyleMapperService;
  const detector = new LanguageDetectorService();

  beforeEach(() => {
    mapper = new CommentStyleMapperService(detector);
  });

  it('returns en when post text is English even if mainPost.language is vi', () => {
    const result = mapper.toTargetLanguage(
      makeInput('OpenAI released a new model today', 'vi'),
      makeDecision('vi'),
    );
    expect(result).toBe('en');
  });

  it('returns en for English football post with accented player name', () => {
    const result = mapper.toTargetLanguage(
      makeInput(
        'France beat Norway with Dembélé show as both fly to round of 32!',
        'vi',
      ),
      makeDecision('vi'),
    );
    expect(result).toBe('en');
  });

  it('returns vi for Vietnamese post text', () => {
    const result = mapper.toTargetLanguage(
      makeInput('Không thể ai khác! Cậu ấy đang có phong độ hủy diệt.', 'vi'),
      makeDecision('vi'),
    );
    expect(result).toBe('vi');
  });

  it('returns ja for Japanese post text', () => {
    const result = mapper.toTargetLanguage(
      makeInput('これは完全にラスボスの登場シーンだ', 'en'),
      makeDecision('en'),
    );
    expect(result).toBe('ja');
  });

  it('returns same_as_original when language is not ja/en/vi', () => {
    const result = mapper.toTargetLanguage(
      makeInput('', 'ko'),
      makeDecision('ko'),
    );
    expect(result).toBe('same_as_original');
  });

  it('falls back to decision.recommendedLanguage when text is empty', () => {
    const result = mapper.toTargetLanguage(
      makeInput('', 'vi'),
      makeDecision('vi'),
    );
    expect(result).toBe('vi');
  });
});
