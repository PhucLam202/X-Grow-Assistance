import { Injectable } from '@nestjs/common';
import { AiReplyPackInput } from '../ai.types';

@Injectable()
export class ReplyPackPromptBuilder {
  build(input: AiReplyPackInput): string {
    const { dto, detectedLanguage, targetLanguage } = input;

    return [
      `Platform: ${dto.platform}`,
      `Detected language: ${detectedLanguage}`,
      `Translation language: ${dto.translationLanguage}`,
      `Target comment language: ${targetLanguage}`,
      `Tone: ${dto.tone}`,
      `Niche: ${dto.niche}`,
      `Max suggestions: ${dto.maxSuggestions}`,
      `Author name: ${dto.authorName ?? ''}`,
      `Author handle: ${dto.authorHandle ?? ''}`,
      `Post URL: ${dto.postUrl ?? ''}`,
      '',
      'Return valid JSON with this shape:',
      '{',
      '  "translation": string,',
      '  "summary": string,',
      '  "context": string,',
      '  "theme": string,',
      '  "topic": string,',
      '  "sentiment": string,',
      '  "commentStrategy": string,',
      '  "suggestions": [',
      '    {',
      '      "text": string,',
      '      "meaningVi": string,',
      '      "tone": string,',
      '      "risk": "low" | "medium" | "high",',
      '      "whyItWorks": string',
      '    }',
      '  ]',
      '}',
      '',
      'Rules:',
      '- Suggestions must be natural, short, and specific to the post.',
      '- Avoid generic replies like Great post or Nice.',
      '- Keep risk low unless the content is clearly uncertain or sensitive.',
      '- Suggestions should match the requested target comment language.',
      '- Write translation, summary, context, and commentStrategy in the translation language.',
      '- If translation language is en, use English for those fields. If vi, use Vietnamese.',
      '- theme should describe the post style or intent, for example: question, opinion, story, announcement, discussion, meme, tutorial.',
      '- topic should describe the content domain, for example: manga, food, family, crypto, football, tech, business, gaming, music, news.',
      '- Return 3 to 5 suggestions if possible.',
      '',
      `Post text:\n${dto.postText}`,
    ].join('\n');
  }
}
