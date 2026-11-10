import type { CreateRequest, GuideRequest, NewRequestInput, Proposal, RequestDto } from '../../../../admin/shared/api-types';
import type { RequestContext } from '../../domain/actor';
import { AppError } from '../../domain/errors';
import type { Clock, RequestRepository } from '../ports';
import type { ActivityService } from './activity-service';
import type { ContentService } from './content-service';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function checkId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new AppError('BAD_PATH', "That request id isn't valid.");
  return id;
}

const TYPE_LABEL: Record<GuideRequest['type'], string> = {
  'check-updates': 'Check for updates',
  'make-video': 'Make a video',
  'refresh-page': 'Refresh a page',
  'new-page': 'Write a new page',
  'new-product': 'Add a new product',
  'new-module': 'Add a new module',
};

function scopeText(r: GuideRequest): string {
  const pages = r.scope.pages ?? [];
  if (pages.length > 3) return `${pages.length} pages: ${pages.slice(0, 3).join(', ')} and ${pages.length - 3} more`;
  if (pages.length) return pages.join(', ');
  return r.scope.products === 'all' ? 'all products' : r.scope.products.join(', ');
}

/**
 * The "Updates & requests" queue. Claude processes it when the owner says
 * "run the guide queue" and writes suggested changes as proposals; the owner
 * ticks which ones to apply.
 */
export class RequestService {
  constructor(
    private readonly repo: RequestRepository,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly randomHex: () => string,
    private readonly content: ContentService | null = null,
  ) {}

  async list(): Promise<RequestDto[]> {
    const all = await this.repo.list();
    const out: RequestDto[] = [];
    for (const r of all) {
      const proposal = await this.repo.getProposal(r.id);
      out.push(proposal ? { ...r, proposal } : r);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(ctx: RequestContext, input: NewRequestInput): Promise<GuideRequest> {
    const now = this.clock.now();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
    const note = input.note?.trim();
    const request: GuideRequest = {
      id: `req-${stamp}-${this.randomHex()}`,
      createdAt: now.toISOString(),
      type: input.type,
      scope: input.scope,
      contentMode: input.contentMode,
      ...(note ? { note } : {}),
      status: 'queued',
      requestedBy: ctx.actor.name,
      ...(input.create ? { create: input.create } : {}),
    };
    await this.repo.save(request);
    await this.activity.record(ctx, { area: 'requests', action: 'request.create', target: request.id, summary: `Asked Claude: ${TYPE_LABEL[request.type]} (${scopeText(request)}, ${request.contentMode})`, details: { request } });
    return request;
  }

  private async require(id: string): Promise<GuideRequest> {
    const r = await this.repo.get(checkId(id));
    if (!r) throw new AppError('NOT_FOUND', 'That request is no longer in the list.');
    return r;
  }

  async cancel(ctx: RequestContext, id: string): Promise<GuideRequest> {
    const r = await this.require(id);
    if (r.status !== 'queued') throw new AppError('INVALID', 'Only requests that are still waiting can be cancelled.');
    const next: GuideRequest = { ...r, status: 'cancelled' };
    await this.repo.save(next);
    await this.activity.record(ctx, { area: 'requests', action: 'request.cancel', target: id, summary: `Cancelled request: ${TYPE_LABEL[r.type]} (${scopeText(r)})` });
    return next;
  }

  /** Takes a finished or cancelled request off the list (the list is not guide content). */
  async dismiss(ctx: RequestContext, id: string): Promise<{ removed: boolean }> {
    const r = await this.require(id);
    if (r.status !== 'cancelled' && r.status !== 'done') throw new AppError('INVALID', 'Cancel the request first, then remove it from the list.');
    await this.repo.remove(id);
    await this.activity.record(ctx, { area: 'requests', action: 'request.dismiss', target: id, summary: `Removed request from the list: ${TYPE_LABEL[r.type]} (${scopeText(r)})`, details: { request: r } });
    return { removed: true };
  }

  async approve(ctx: RequestContext, id: string, approved: string[]): Promise<RequestDto> {
    const r = await this.require(id);
    const proposal = await this.repo.getProposal(id);
    if (!proposal) throw new AppError('NOT_FOUND', 'There are no suggested changes for this request yet.');
    const known = new Set(proposal.changes.map((c) => c.id));
    const chosen = [...new Set(approved.filter((a) => known.has(a)))];
    if (chosen.length === 0) throw new AppError('INVALID', 'Tick at least one change to apply.', [{ field: 'approved', message: 'Tick at least one change' }]);
    const next: Proposal = { ...proposal, approved: chosen };
    await this.repo.saveProposal(id, next);
    const request: GuideRequest = { ...r, status: 'in-progress' };
    await this.repo.save(request);
    await this.activity.record(ctx, { area: 'requests', action: 'request.approve', target: id, summary: `Approved ${chosen.length} of ${proposal.changes.length} suggested changes`, details: { approved: chosen } });
    return { ...request, proposal: next };
  }

  /**
   * Creates a product or module exactly as described. Used directly by owners
   * (no approval needed for their own creations) and by "Approve and create".
   */
  async createFromRequest(ctx: RequestContext, c: CreateRequest): Promise<{ created: string }> {
    if (!this.content) throw new AppError('NOT_CONFIGURED', 'Creating products is not available here.');
    if (c.kind === 'product') {
      const product = await this.content.createProduct(ctx, { slug: c.product, name: c.name, summary: c.summary });
      if (c.repos?.length) {
        const repos = c.repos.map((r) => ({ url: r.url, branch: r.branch || 'main', paths: r.paths ?? [] }));
        await this.content.saveProduct(ctx, c.product, { ...product, source: { repos } });
      }
      if (c.module) await this.content.createModule(ctx, c.product, { slug: c.module, title: c.name, summary: c.summary, group: c.group ?? 'run', ...(c.area ? { area: c.area } : {}) });
      return { created: c.product };
    }
    if (!c.module) throw new AppError('INVALID', 'Give the new module a web address name.', [{ field: 'module', message: 'is required' }]);
    await this.content.createModule(ctx, c.product, { slug: c.module, title: c.name, summary: c.summary, group: c.group ?? 'run', ...(c.area ? { area: c.area } : {}) });
    return { created: `${c.product}/${c.module}` };
  }

  /** The owner's "Approve and create" for a new-product / new-module request. */
  async approveCreate(ctx: RequestContext, id: string): Promise<RequestDto> {
    const r = await this.require(id);
    if (r.status !== 'queued') throw new AppError('INVALID', 'This request has already been handled.');
    if (!r.create) throw new AppError('INVALID', 'This request does not say what to create. Create it in Products, then cancel the request.');
    const { created } = await this.createFromRequest(ctx, r.create);
    const next: GuideRequest = { ...r, status: 'done' };
    await this.repo.save(next);
    await this.activity.record(ctx, { area: 'requests', action: 'request.approve-create', target: id, summary: `Approved and created ${r.create.kind} “${r.create.name}” (${created}) for ${r.requestedBy ?? 'someone'}`, details: { create: r.create } });
    return next;
  }
}
