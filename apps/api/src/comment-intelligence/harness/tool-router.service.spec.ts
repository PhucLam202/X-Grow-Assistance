import { ToolRegistryService } from './tool-registry.service';
import { ToolRouterService } from './tool-router.service';
import { HarnessState } from './harness.types';

function createState(): HarnessState {
  return {
    runId: 'run-1',
    status: 'started',
    input: {
      platform: 'x',
      mainPost: { text: 'hello' },
      extraction: { confidence: 1, warnings: [], missingFields: [] },
    },
    enrichedInput: {
      platform: 'x',
      mainPost: { text: 'hello' },
      extraction: { confidence: 1, warnings: [], missingFields: [] },
    },
    toolCalls: [],
    warnings: [],
    startedAt: new Date().toISOString(),
  };
}

describe('ToolRouterService', () => {
  it('runs approved tools once and skips duplicates or unknown tools', async () => {
    const registry = {
      get: jest.fn((name: string) => {
        if (name !== 'approved_tool') return undefined;
        return {
          name: 'approved_tool',
          aliases: [],
          critical: false,
          execute: jest.fn(() => ({ output: { ok: true } })),
        };
      }),
    } as unknown as ToolRegistryService;
    const router = new ToolRouterService(registry);
    const state = createState();

    const records = await router.run(
      ['approved_tool', 'approved_tool', 'unknown_tool'],
      state,
    );

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.status)).toEqual([
      'success',
      'skipped',
      'skipped',
    ]);
    expect(state.toolCalls).toHaveLength(3);
  });
});
