import { AiProviderName, AiReplyPackInput, AiVisionInput } from '../ai.types';

export interface AiProvider {
  readonly name: AiProviderName;
  generateReplyPack(input: AiReplyPackInput): Promise<string>;
  analyzeVision?(input: AiVisionInput): Promise<string>;
  analyzeVisionContext?(input: AiVisionInput): Promise<string>;
}
