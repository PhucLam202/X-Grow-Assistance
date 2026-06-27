import { AiDriverService } from '../ai-driver.service';
import { CommentComposerService } from '../composer/comment-composer.service';
import { DriverDecision } from '../types/comment-intelligence.types';
import { CommentAiHarnessService } from './comment-ai-harness.service';
import { HarnessLogRepository } from './harness-log.repository';
import { ToolRouterService } from './tool-router.service';

const decision: DriverDecision = {
  zone: 'technical_insight',
  intent: 'share_insight',
  shouldComment: true,
  recommendedLanguage: 'en',
  recommendedTone: 'insightful',
  recommendedDepth: 'medium',
  commentStrategy: 'Add useful detail.',
  avoid: [],
  requiredTools: [],
  needsContextExpansion: false,
  contextReasons: [],
  decisionStage: 'final',
  confidence: 0.9,
  warnings: [],
};

describe('CommentAiHarnessService', () => {
  it('runs driver, router, composer, and logging in order', async () => {
    const service = new CommentAiHarnessService(
      { decide: jest.fn(() => decision) } as unknown as AiDriverService,
      {
        run: jest.fn(() => Promise.resolve([])),
      } as unknown as ToolRouterService,
      {
        compose: jest.fn(() =>
          Promise.resolve({
            bestPick: {
              text: 'The practical fix is the useful part here.',
              label: 'bestPick',
              style: 'value_add',
              score: 88,
              reason: 'specific',
              risk: 'low',
            },
            alternatives: [],
            warnings: [],
          }),
        ),
      } as unknown as CommentComposerService,
      {
        startRun: jest.fn(() => Promise.resolve(undefined)),
        completeRun: jest.fn(() => Promise.resolve(undefined)),
        failRun: jest.fn(() => Promise.resolve(undefined)),
        recordToolCall: jest.fn(() => Promise.resolve(undefined)),
      } as unknown as HarnessLogRepository,
    );

    const result = await service.run({
      platform: 'x',
      mainPost: { text: 'React stale closure bug.' },
      extraction: { confidence: 0.9, warnings: [], missingFields: [] },
    });

    expect(result.status).toBe('completed');
    expect(result.composerOutput?.bestPick?.score).toBe(88);
  });
});
