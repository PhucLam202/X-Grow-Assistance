import type { GenerateReplyPackRequest, HistoryItem, ReplyPack } from './types';

const HISTORY_STORAGE_KEY = 'x_comment_assistant_history_v1';
const MAX_HISTORY_ITEMS = 20;

function createHistoryId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `history_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getHistoryItems(): HistoryItem[] {
  try {
    const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawHistory) return [];

    const parsedHistory = JSON.parse(rawHistory) as HistoryItem[];
    return Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch {
    return [];
  }
}

function writeHistoryItems(items: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // History is useful but not critical for the core flow.
  }
}

export function addHistoryItem(
  request: GenerateReplyPackRequest,
  replyPack: ReplyPack,
): HistoryItem {
  const item: HistoryItem = {
    id: createHistoryId(),
    platform: request.platform,
    postText: request.postText,
    postUrl: request.postUrl,
    tone: request.tone,
    targetCommentLanguage: request.targetCommentLanguage,
    replyPack,
    createdAt: new Date().toISOString(),
  };

  writeHistoryItems([item, ...getHistoryItems()]);
  return item;
}

export function clearHistoryItems(): void {
  writeHistoryItems([]);
}
