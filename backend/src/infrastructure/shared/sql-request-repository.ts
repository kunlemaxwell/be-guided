import { guideRequestSchema, proposalSchema, type GuideRequest, type Proposal } from '../../../../admin/shared/api-types';
import type { RequestRepository, SqlDatabase } from '../../application/ports';

/**
 * The request queue in D1 (Cloudflare mode).
 * PROTOTYPE: in the cloud nothing processes this queue yet — Claude reads the
 * local .admin/requests.json on "run the guide queue". Production: a worker or
 * agent that reads guide_requests (and writes proposals) via this API.
 */
export class SqlRequestRepository implements RequestRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<GuideRequest[]> {
    const rows = await this.db.all<{ data: string }>('SELECT data FROM guide_requests ORDER BY created_at DESC');
    return rows.flatMap((r) => {
      try {
        const p = guideRequestSchema.safeParse(JSON.parse(r.data));
        return p.success ? [p.data] : [];
      } catch {
        return [];
      }
    });
  }

  async get(id: string): Promise<GuideRequest | null> {
    const r = await this.db.first<{ data: string }>('SELECT data FROM guide_requests WHERE id = ?', [id]);
    if (!r) return null;
    const p = guideRequestSchema.safeParse(JSON.parse(r.data));
    return p.success ? p.data : null;
  }

  async save(request: GuideRequest): Promise<void> {
    await this.db.run(
      'INSERT INTO guide_requests (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      [request.id, request.createdAt, JSON.stringify(request)],
    );
  }

  async remove(id: string): Promise<void> {
    await this.db.run('DELETE FROM guide_requests WHERE id = ?', [id]);
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const r = await this.db.first<{ proposal: string | null }>('SELECT proposal FROM guide_requests WHERE id = ?', [id]);
    if (!r?.proposal) return null;
    const p = proposalSchema.safeParse(JSON.parse(r.proposal));
    return p.success ? p.data : null;
  }

  async saveProposal(id: string, proposal: Proposal): Promise<void> {
    await this.db.run('UPDATE guide_requests SET proposal = ? WHERE id = ?', [JSON.stringify(proposal), id]);
  }
}
