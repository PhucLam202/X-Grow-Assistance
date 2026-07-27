import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type { GeneratedCandidate } from '../candidates/candidate.types';
import { EmpathyFitScorer } from './empathy-fit.scorer';
import { FinalScoreService, aggregateSelfScore } from './final-score.service';
import { RuleScoringService } from './rule-scoring.service';
import { ScoringFeatureExtractor } from './scoring-feature.extractor';
import {
  RULE_WEIGHTS,
  SELF_SCORE_BLEND,
  type CandidateScoringInput,
} from './scoring.types';

const POST =
  'Base sequencer went down for 40 minutes this morning. Zero funds lost but withdrawals were stuck.';

function candidate(
  overrides: Partial<GeneratedCandidate> = {},
): GeneratedCandidate {
  return {
    id: 'a',
    slotId: 'slot_1',
    text: 'Were the stuck withdrawals reachable through the escape hatch during those 40 minutes?',
    niche: 'crypto',
    nicheConfidence: 0.9,
    intent: 'ask',
    tone: 'question_based',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the stuck withdrawals',
    selfScore: { postFit: 0.8, naturalness: 0.8, empathyFit: 0.7 },
    generationAttempt: 1,
    ...overrides,
  };
}

describe('FinalScoreService', () => {
  let service: FinalScoreService;
  let policy: ResolvedNichePolicy;

  beforeEach(() => {
    resetNichePolicies();
    policy = new NichePolicyResolver().resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
    });

    service = new FinalScoreService(
      new ScoringFeatureExtractor(new EmpathyFitScorer()),
      new RuleScoringService(),
    );
  });

  afterAll(() => {
    resetNichePolicies();
  });

  function input(
    candidates: GeneratedCandidate[],
    overrides: Partial<CandidateScoringInput> = {},
  ): CandidateScoringInput {
    return {
      postContext: { text: POST, language: 'en' },
      nichePolicy: policy,
      candidates,
      penalties: [],
      visionAlignment: candidates.map((c) => ({
        candidateId: c.id,
        aligned: false,
      })),
      ...overrides,
    };
  }

  it('sums the documented weights to exactly 1.0', () => {
    const total = Object.values(RULE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(SELF_SCORE_BLEND.rule + SELF_SCORE_BLEND.selfScore).toBeCloseTo(
      1,
      10,
    );
  });

  // Doc test case 12.
  it('keeps every score inside 0-1', () => {
    const [scored] = service.scoreAll(input([candidate()]));

    for (const value of Object.values(scored.scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  // Doc test case 1 vs 2.
  it('scores a specific, on-context reply above a generic one', () => {
    const [specific, generic] = service.scoreAll(
      input([
        candidate({ id: 'specific' }),
        candidate({
          id: 'generic',
          text: 'This is a really interesting situation and definitely worth thinking about more',
          referencedConcept: 'the situation',
          intent: 'react',
          tone: 'short_native',
        }),
      ]),
    );

    expect(specific.scores.finalScore).toBeGreaterThan(
      generic.scores.finalScore,
    );
    expect(specific.scores.specificity).toBeGreaterThan(
      generic.scores.specificity,
    );
  });

  // Doc test case 3.
  it('scores nicheFit lower when the niche is only a guess', () => {
    const confident = service.scoreAll(input([candidate({ id: 'sure' })]))[0];
    const unsure = service.scoreAll(
      input([candidate({ id: 'unsure', nicheConfidence: 0.2 })]),
    )[0];

    expect(unsure.scores.nicheFit).toBeLessThan(confident.scores.nicheFit);
  });

  // Doc test case 5.
  it('blends the model self-score with the documented weights', () => {
    const [scored] = service.scoreAll(input([candidate()]));

    expect(scored.scoringMethod).toBe('rule_plus_self_score');
    expect(scored.scores.modelSelfScore).toBeCloseTo(
      aggregateSelfScore(candidate().selfScore) as number,
      10,
    );
    expect(scored.scores.finalScore).toBeCloseTo(
      scored.scores.ruleScore * SELF_SCORE_BLEND.rule +
        (scored.scores.modelSelfScore as number) * SELF_SCORE_BLEND.selfScore,
      10,
    );
  });

  // Doc test case 6 — chỉ đạt được nhờ `selfScore` optional ở Phase 4.
  it('falls back to rule_only when the model returned no self-score', () => {
    const [scored] = service.scoreAll(
      input([candidate({ id: 'no_self', selfScore: undefined })]),
    );

    expect(scored.scoringMethod).toBe('rule_only');
    expect(scored.scores.modelSelfScore).toBeUndefined();
    expect(scored.scores.finalScore).toBeCloseTo(scored.scores.ruleScore, 10);
    expect(scored.scoreReasons.join(' ')).toMatch(/no self-score/);
  });

  it('subtracts Phase 5 penalties from the rule score', () => {
    const clean = service.scoreAll(input([candidate()]))[0];
    const penalised = service.scoreAll(
      input([candidate()], {
        penalties: [
          {
            candidateId: 'a',
            code: 'cliche_phrase',
            detail: 'uses "well said"',
          },
        ],
      }),
    )[0];

    expect(penalised.scores.ruleScore).toBeLessThan(clean.scores.ruleScore);
    expect(penalised.scoreReasons.join(' ')).toMatch(/Penalty cliche_phrase/);
  });

  it('does not double-count a soft safety flag', () => {
    const [scored] = service.scoreAll(
      input([candidate()], {
        penalties: [
          {
            candidateId: 'a',
            code: 'niche_safety_soft',
            detail: 'downplays risk',
          },
        ],
      }),
    );

    // Cờ mềm đi vào feature `safetyScore`...
    expect(scored.scores.safetyScore).toBeLessThan(1);
    // ...và KHÔNG bị trừ thêm lần nữa qua penalty.
    expect(scored.scoreReasons.join(' ')).not.toMatch(/Penalty niche_safety/);
  });

  // Doc test case 4.
  it('raises empathy and postFit for a reply anchored in the image', () => {
    const visionContext = {
      summary: 'A grafana dashboard with a flatlined block production chart.',
      detectedEntities: ['grafana dashboard', 'block production chart'],
    };

    const imageAware = candidate({
      id: 'image',
      text: 'That flatlined block production chart tells the story better than the status page',
      referencedConcept: 'the block production chart',
      empathySignal: 'acknowledges how bad the chart looked',
    });

    const aligned = service.scoreAll(
      input([imageAware], {
        visionContext,
        visionAlignment: [{ candidateId: 'image', aligned: true }],
      }),
    )[0];

    const notAligned = service.scoreAll(
      input([imageAware], {
        visionContext,
        visionAlignment: [{ candidateId: 'image', aligned: false }],
      }),
    )[0];

    expect(aligned.scores.postFit).toBeGreaterThan(notAligned.scores.postFit);
    expect(aligned.scores.empathyFit).toBeGreaterThan(
      notAligned.scores.empathyFit,
    );
    expect(aligned.visionAligned).toBe(true);
  });

  it('rewards a reply that matches the user style over one that does not', () => {
    const userStyle = {
      preferredTones: ['question_based' as const],
      preferredLength: 'short' as const,
    };

    const matching = service.scoreAll(input([candidate()], { userStyle }))[0];
    const mismatching = service.scoreAll(
      input([candidate({ tone: 'funny_light' })], { userStyle }),
    )[0];

    expect(matching.scores.userStyleFit).toBeGreaterThan(
      mismatching.scores.userStyleFit,
    );
  });

  it('reports reasons ordered by weight', () => {
    const [scored] = service.scoreAll(input([candidate()]));

    expect(scored.scoreReasons.length).toBeGreaterThan(0);
    // Lý do đầu tiên phải nói về feature nặng nhất đang lệch, không phải một
    // feature 5%.
    expect(scored.scoreReasons[0]).not.toMatch(/Match with your style/);
  });
});

describe('aggregateSelfScore', () => {
  it('returns undefined for a missing self-score', () => {
    expect(aggregateSelfScore(undefined)).toBeUndefined();
  });

  it('weights postFit above naturalness above empathy', () => {
    const postHeavy = aggregateSelfScore({
      postFit: 1,
      naturalness: 0,
      empathyFit: 0,
    }) as number;
    const empathyHeavy = aggregateSelfScore({
      postFit: 0,
      naturalness: 0,
      empathyFit: 1,
    }) as number;

    expect(postHeavy).toBeGreaterThan(empathyHeavy);
  });

  it('maps an all-ones self-score to 1', () => {
    expect(
      aggregateSelfScore({ postFit: 1, naturalness: 1, empathyFit: 1 }),
    ).toBeCloseTo(1, 10);
  });
});
