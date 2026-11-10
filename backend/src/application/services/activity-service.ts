import type { AuditArea, AuditEntryDto, AuditQuery, FieldChange, PageQuery, Paged, RevisionAction, RevisionDetailDto, RevisionSummaryDto } from '../../../../admin/shared/api-types';
import type { RequestContext } from '../../domain/actor';
import { diffText, summarizeChange } from '../../domain/diff';
import { AppError } from '../../domain/errors';
import type { ActivityRepository, Clock } from '../ports';

export interface AuditEvent {
  area: AuditArea;
  /** Constant code, e.g. "page.save". */
  action: string;
  target: string;
  summary: string;
  details?: unknown;
}

export interface PageChange {
  pageId: string;
  action: RevisionAction;
  bodyBefore: string;
  bodyAfter: string;
  fieldChanges: FieldChange[];
  /** Overrides the computed summary (e.g. "Created the page"). */
  summary?: string;
}

/**
 * The audit log and page version history. Every mutating service call ends
 * with `record`, which writes the audit entry (and the page revision, when
 * there is one) in one atomic batch.
 */
export class ActivityService {
  constructor(
    private readonly repo: ActivityRepository,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  /** Builds the revision for a page change: field changes + line diff of the text (never files). */
  revision(ctx: RequestContext, change: PageChange): RevisionDetailDto {
    const diff = diffText(change.bodyBefore, change.bodyAfter);
    const computed = summarizeChange(change.fieldChanges, diff.added, diff.removed);
    return {
      id: this.newId(),
      pageId: change.pageId,
      createdAt: this.clock.now().toISOString(),
      actorId: ctx.actor.personId,
      actorName: ctx.actor.name,
      action: change.action,
      summary: change.summary ? (diff.added || diff.removed || change.fieldChanges.length ? `${change.summary}; ${computed}` : change.summary) : computed,
      linesAdded: diff.added,
      linesRemoved: diff.removed,
      fieldChanges: change.fieldChanges,
      bodyDiff: diff.hunks,
      correlationId: ctx.correlationId,
    };
  }

  async record(ctx: RequestContext, event: AuditEvent, revision?: RevisionDetailDto): Promise<AuditEntryDto> {
    const entry: AuditEntryDto = {
      id: this.newId(),
      at: this.clock.now().toISOString(),
      actorId: ctx.actor.personId,
      actorName: ctx.actor.name,
      area: event.area,
      action: event.action,
      target: event.target,
      summary: event.summary,
      details: event.details ?? {},
      correlationId: ctx.correlationId,
    };
    await this.repo.record(entry, revision);
    return entry;
  }

  queryAudit(query: AuditQuery): Promise<Paged<AuditEntryDto>> {
    return this.repo.queryAudit(query);
  }

  async getAudit(id: string): Promise<AuditEntryDto> {
    const e = await this.repo.getAudit(id);
    if (!e) throw new AppError('NOT_FOUND', 'That audit entry does not exist.');
    return e;
  }

  listRevisions(pageId: string, query: PageQuery): Promise<Paged<RevisionSummaryDto>> {
    return this.repo.listRevisions(pageId, query);
  }

  async getRevision(pageId: string, id: string): Promise<RevisionDetailDto> {
    const r = await this.repo.getRevision(pageId, id);
    if (!r) throw new AppError('NOT_FOUND', 'That version of the page does not exist.');
    return r;
  }
}
