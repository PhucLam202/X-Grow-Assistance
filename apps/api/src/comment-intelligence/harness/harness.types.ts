import {
  ComposerOutput,
  DriverDecision,
  DriverInput,
} from '../types/comment-intelligence.types';

export type HarnessStatus = 'started' | 'completed' | 'failed' | 'skipped';
export type HarnessToolStatus = 'success' | 'skipped' | 'failed';

export type HarnessToolCallRecord = {
  toolName: string;
  status: HarnessToolStatus;
  critical: boolean;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
};

export type HarnessState = {
  runId: string;
  status: HarnessStatus;
  input: DriverInput;
  enrichedInput: DriverInput;
  initialDecision?: DriverDecision;
  finalDecision?: DriverDecision;
  composerOutput?: ComposerOutput;
  toolCalls: HarnessToolCallRecord[];
  warnings: string[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
};

export type ToolExecutionContext = {
  state: HarnessState;
};

export type ToolExecutionResult = {
  output: Record<string, unknown>;
  enrichedInput?: DriverInput;
  warnings?: string[];
};

export type HarnessToolDefinition = {
  name: string;
  aliases: string[];
  critical: boolean;
  execute(
    context: ToolExecutionContext,
  ): ToolExecutionResult | Promise<ToolExecutionResult>;
};

export type HarnessRunDocument = {
  runId: string;
  status: HarnessStatus;
  input: DriverInput;
  enrichedInput?: DriverInput;
  initialDecision?: DriverDecision;
  finalDecision?: DriverDecision;
  composerOutput?: ComposerOutput;
  warnings: string[];
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
};
