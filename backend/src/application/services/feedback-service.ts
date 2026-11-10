import type { FeedbackSummaryDto, VoteInput } from '../../../../admin/shared/automation-types';
import type { SqlVoteRepository } from '../../infrastructure/shared/sql-automation-repositories';
import { AppError } from '../../domain/errors';
import type { Clock, GuidePageSource } from '../ports';

/** Readers' "Was this helpful?" votes on the public guide, and the owner's view of them. */
export class FeedbackService {
  constructor(
    private readonly votes: SqlVoteRepository,
    private readonly guide: GuidePageSource,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  /** A reader's vote. A second vote from the same browser on the same page replaces the first. */
  async vote(input: VoteInput, country: string | null): Promise<{ saved: true }> {
    // Only published, public pages take votes (no junk rows for made-up page ids).
    const published = await this.guide.publicPages();
    if (!published.some((p) => p.id === input.pageId)) throw new AppError('NOT_FOUND', 'That page is not on the public guide.');
    await this.votes.upsert({
      id: this.newId(),
      pageId: input.pageId,
      visitor: input.visitor,
      helpful: input.helpful,
      comment: input.comment?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      at: this.clock.now().toISOString(),
    });
    return { saved: true };
  }

  async summary(filter: { pageId?: string; helpful?: boolean; limit?: number } = {}): Promise<FeedbackSummaryDto> {
    const [totals, pages, votes, published] = await Promise.all([
      this.votes.totals(),
      this.votes.perPage(),
      this.votes.list({ pageId: filter.pageId, helpful: filter.helpful, limit: Math.min(filter.limit ?? 200, 500) }),
      this.guide.publicPages().catch(() => []),
    ]);
    const titles = new Map(published.map((p) => [p.id, p.title]));
    return {
      totals,
      pages: pages.map((p) => ({ ...p, pageTitle: titles.get(p.pageId) ?? null })),
      votes: votes.map((v) => ({ ...v, pageTitle: titles.get(v.pageId) ?? null })),
    };
  }
}
