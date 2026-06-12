export type CopyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'empty_text'
        | 'clipboard_unavailable'
        | 'permission_denied'
        | 'unknown';
    };

export async function copyTextToClipboard(text: string): Promise<CopyResult> {
  if (!text.trim()) {
    return { ok: false, reason: 'empty_text' };
  }

  if (!navigator.clipboard?.writeText) {
    return { ok: false, reason: 'clipboard_unavailable' };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return { ok: false, reason: 'permission_denied' };
    }

    return { ok: false, reason: 'unknown' };
  }
}
