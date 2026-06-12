import { AiReplyPackService } from '../ai/ai-reply-pack.service';
import { AiReplyPackInput } from '../ai/ai.types';
import { LanguageDetectorService } from '../common/language/language-detector.service';
import { ReplyPack } from './types/reply-pack.types';
import { ReplyPackService } from './reply-pack.service';

describe('ReplyPackService', () => {
  const replyPack: ReplyPack = {
    detectedLanguage: 'ja',
    translationLanguage: 'vi',
    translation: 'translation',
    summary: 'summary',
    context: 'context',
    theme: 'discussion',
    topic: 'manga',
    sentiment: 'neutral',
    commentStrategy: 'strategy',
    suggestions: [
      {
        text: 'suggestion 1',
        meaningVi: 'meaning 1',
        tone: 'anime_fan',
        risk: 'low',
        whyItWorks: 'why 1',
      },
      {
        text: 'suggestion 2',
        meaningVi: 'meaning 2',
        tone: 'anime_fan',
        risk: 'low',
        whyItWorks: 'why 2',
      },
      {
        text: 'suggestion 3',
        meaningVi: 'meaning 3',
        tone: 'anime_fan',
        risk: 'low',
        whyItWorks: 'why 3',
      },
    ],
  };

  let capturedInput: AiReplyPackInput | undefined;

  const aiService = {
    generateReplyPack(input: AiReplyPackInput): Promise<ReplyPack> {
      capturedInput = input;
      return Promise.resolve(replyPack);
    },
  } as AiReplyPackService;

  const service = new ReplyPackService(
    aiService,
    new LanguageDetectorService(),
  );

  beforeEach(() => {
    capturedInput = undefined;
  });

  it('delegates reply pack generation to the AI service', async () => {
    const result = await service.generate({
      platform: 'x',
      postText: 'これはかなり面白いですね',
      translationLanguage: 'vi',
      targetCommentLanguage: 'same_as_original',
      tone: 'anime_fan',
      niche: 'anime_manga',
      maxSuggestions: 2,
    });

    expect(result.topic).toBe('manga');
    expect(result.suggestions).toHaveLength(3);
    expect(capturedInput).toBeDefined();
    expect(capturedInput?.dto.postText).toBe('これはかなり面白いですね');
    expect(capturedInput?.detectedLanguage).toBe('ja');
    expect(capturedInput?.targetLanguage).toBe('ja');
  });

  it('resolves explicit target language before delegating', async () => {
    await service.generate({
      platform: 'x',
      postText: 'This is a good point',
      translationLanguage: 'vi',
      targetCommentLanguage: 'vi',
      tone: 'funny_light',
      niche: 'business',
      maxSuggestions: 3,
    });

    expect(capturedInput).toBeDefined();
    expect(capturedInput?.dto.postText).toBe('This is a good point');
    expect(capturedInput?.detectedLanguage).toBe('en');
    expect(capturedInput?.targetLanguage).toBe('vi');
  });
});
