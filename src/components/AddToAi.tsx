'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, ExternalIcon } from './Icons';

export const CONNECTOR_NAME = 'Be Guided guide';

/** Claude's own install link: opens "Add custom connector" with the name and address filled in. */
export function claudeInstallUrl(url: string): string {
  return `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(CONNECTOR_NAME)}&connectorUrl=${encodeURIComponent(url)}`;
}

/**
 * One-click "Add to Claude" / "Add to ChatGPT". Claude opens its connector box
 * already filled in (the reader just presses Add). ChatGPT has no install link,
 * so the button copies the address, opens ChatGPT and shows the three things to do there.
 */
export function AddToAi({ url, compact = false }: { url: string | null; compact?: boolean }) {
  const [chatgpt, setChatgpt] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [codeCopied, setCodeCopied] = useState(false);

  if (!url) {
    return <p className="add-ai__pending">One-click buttons appear here once the guide is online.</p>;
  }

  const openChatGpt = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setChatgpt('copied');
    } catch {
      setChatgpt('manual');
    }
    window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
  };
  const claudeCode = `claude mcp add --transport http be-guided ${url}`;
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(claudeCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      /* the command stays visible to copy by hand */
    }
  };

  return (
    <div className={compact ? 'add-ai add-ai--compact' : 'add-ai'}>
      <div className="add-ai__buttons">
        <a className="btn btn--primary add-ai__btn" href={claudeInstallUrl(url)} target="_blank" rel="noopener noreferrer">
          Add to Claude <ExternalIcon size={12} />
        </a>
        <button type="button" className="btn add-ai__btn" onClick={openChatGpt}>
          Add to ChatGPT <ExternalIcon size={12} />
        </button>
      </div>
      <p className="add-ai__hint">
        <strong>Claude:</strong> the connector box opens already filled in. Just press <strong>Add</strong>.
      </p>
      {chatgpt !== 'idle' ? (
        <div className="add-ai__chatgpt" role="status">
          <p>
            {chatgpt === 'copied' ? (
              <>
                <CheckIcon size={14} /> Address copied. ChatGPT is open in a new tab:
              </>
            ) : (
              <>ChatGPT is open in a new tab. Copy this address first: <code>{url}</code></>
            )}
          </p>
          <ol>
            <li>
              Go to <strong>Plugins</strong> (or <strong>Settings › Connectors</strong>), press <strong>+</strong>, then <strong>Add custom MCP server</strong>.
            </li>
            <li>
              Paste the address, choose <strong>No authentication</strong>.
            </li>
            <li>
              Press <strong>Create</strong>. Done.
            </li>
          </ol>
        </div>
      ) : (
        <p className="add-ai__hint">
          <strong>ChatGPT:</strong> copies the address and opens ChatGPT, then shows the three clicks to finish.
        </p>
      )}
      {!compact ? (
        <div className="add-ai__code">
          <span className="add-ai__code-label">Claude Code (one line in Terminal)</span>
          <span className="add-ai__code-row">
            <code>{claudeCode}</code>
            <button type="button" className="btn btn--small" onClick={copyCode}>
              {codeCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />} {codeCopied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
