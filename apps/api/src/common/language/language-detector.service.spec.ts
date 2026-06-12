import { LanguageDetectorService } from './language-detector.service';

describe('LanguageDetectorService', () => {
  const service = new LanguageDetectorService();

  it.each([
    ['これは面白いですね', 'ja'],
    ['이건 흥미롭네요', 'ko'],
    ['这个观点很有意思', 'zh'],
    ['Goc nhin nay đáng suy nghĩ', 'vi'],
    ['This is interesting', 'en'],
    ['12345', 'unknown'],
  ])('detects %s as %s', (text, language) => {
    expect(service.detect(text)).toBe(language);
  });
});
