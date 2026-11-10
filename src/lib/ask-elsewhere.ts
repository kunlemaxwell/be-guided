import { connectorUrl } from './api/config';

/**
 * Links that open the reader's own Claude or ChatGPT with a ready-made
 * question. The prompt asks the assistant to use the Be Guided
 * connector (if the reader added it) and to show the guide's screenshots.
 */
export function askElsewherePrompt(question: string, siteUrl: string): string {
  const q = question.trim() || 'How do I get started?';
  const mcp = connectorUrl();
  const source = mcp
    ? `Use the "Be Guided" connector (${mcp}) to search and fetch the guide pages.`
    : `Use the Be Guided user guide at ${siteUrl}.`;
  return [
    `${q}`,
    '',
    `${source} Answer step by step from the guide only, link each guide page you used, and show the step screenshots `,
    '(the image links in the fetched page) inline, or in an artifact if that shows them better.',
  ].join('\n');
}

export function claudeUrl(question: string, siteUrl: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(askElsewherePrompt(question, siteUrl))}`;
}

export function chatGptUrl(question: string, siteUrl: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(askElsewherePrompt(question, siteUrl))}`;
}
