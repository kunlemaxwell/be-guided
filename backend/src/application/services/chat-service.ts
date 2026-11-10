import type { ChatAnswerDto, ChatInput } from '../../../../admin/shared/api-types';
import { AppError } from '../../domain/errors';
import { rankPages } from '../../domain/retrieval';
import type { ChatModel, GuidePageSource } from '../ports';

/** Characters of one page's text given to the model. PROTOTYPE: fixed cap instead of token counting. */
const PAGE_TEXT_LIMIT = 12_000;
const MAX_SOURCES = 5;

/**
 * Ask AI for the public site: finds the most relevant published, public
 * pages by keyword overlap and has the model answer only from them.
 */
export class ChatService {
  constructor(
    private readonly guide: GuidePageSource,
    private readonly model: ChatModel | null,
  ) {}

  get available(): boolean {
    return this.model !== null;
  }

  async ask(input: ChatInput): Promise<ChatAnswerDto> {
    if (!this.model) throw new AppError('NOT_CONFIGURED', 'Ask AI is not switched on yet. Please use the guide pages or contact support.');
    const supportUrl = await this.guide.supportUrl();
    const pageId = input.page?.replace(/^\/+|\/+$/g, '');
    // The latest question matters most; earlier questions add context.
    const userTurns = input.messages.filter((m) => m.role === 'user').map((m) => m.content);
    const latest = userTurns[userTurns.length - 1] ?? '';
    const query = [latest, latest, ...userTurns.slice(-3, -1)].join(' ');
    const ranked = rankPages(await this.guide.publicPages(), query, { product: input.product, pageId, limit: MAX_SOURCES });
    if (ranked.length === 0) {
      return {
        answer: `I couldn't find that in the guide. Try different words, browse the guide pages${supportUrl ? `, or contact support: ${supportUrl}` : ', or contact your support team'}.`,
        sources: [],
      };
    }
    const pages = ranked.map(({ page }) => ({
      id: page.id,
      title: page.title,
      href: page.href,
      text: `${page.summary}\n\n${page.body}`.slice(0, PAGE_TEXT_LIMIT),
    }));
    const result = await this.model.answer({ messages: input.messages, pages, supportUrl });
    const used = new Set(result.usedPageIds);
    const cited = pages.filter((p) => used.has(p.id));
    return { answer: result.answer, sources: cited.map((p) => ({ id: p.id, title: p.title, href: p.href })) };
  }
}
