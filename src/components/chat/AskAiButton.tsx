'use client';

import { SparkIcon } from '../Icons';
import { useChat } from './ChatProvider';

/** Header "Ask AI" button; opens the same panel as the bottom-right launcher. */
export function AskAiButton() {
  const chat = useChat();
  return (
    <button
      type="button"
      className="btn header-ask"
      onClick={() => chat?.open()}
      disabled={!chat}
      aria-haspopup="dialog"
      aria-expanded={chat?.isOpen ?? false}
    >
      <SparkIcon size={14} /> Ask AI
    </button>
  );
}
