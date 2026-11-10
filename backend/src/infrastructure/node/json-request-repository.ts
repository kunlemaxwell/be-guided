import fs from 'node:fs';
import { guideRequestSchema, proposalSchema, type GuideRequest, type Proposal } from '../../../../admin/shared/api-types';
import type { RequestRepository } from '../../application/ports';
import { AppError } from '../../domain/errors';
import { isFile, readJsonFile, within, writeJsonAtomic } from './fs-safe';

/**
 * The local request queue: `.admin/requests.json` (a JSON array) plus
 * `.admin/proposals/<requestId>.json` files written by Claude. The format is
 * unchanged so Claude can keep processing it on "run the guide queue".
 */
export class JsonRequestRepository implements RequestRepository {
  constructor(private readonly stateDir: string) {}

  private file(): string {
    return within(this.stateDir, 'requests.json');
  }

  private proposalFile(id: string): string {
    return within(this.stateDir, 'proposals', `${id}.json`);
  }

  private readAll(): GuideRequest[] {
    const file = this.file();
    if (!isFile(file)) return [];
    const raw = readJsonFile(file);
    if (!Array.isArray(raw)) throw new AppError('SERVER_ERROR', 'The request list file is damaged.');
    return raw.flatMap((r) => {
      const parsed = guideRequestSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private writeAll(requests: GuideRequest[]): void {
    writeJsonAtomic(this.file(), requests);
  }

  ensure(): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    if (!isFile(this.file())) this.writeAll([]);
  }

  async list(): Promise<GuideRequest[]> {
    return this.readAll();
  }

  async get(id: string): Promise<GuideRequest | null> {
    return this.readAll().find((r) => r.id === id) ?? null;
  }

  async save(request: GuideRequest): Promise<void> {
    const all = this.readAll();
    const i = all.findIndex((r) => r.id === request.id);
    if (i >= 0) all[i] = request;
    else all.push(request);
    this.writeAll(all);
  }

  async remove(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((r) => r.id !== id));
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const file = this.proposalFile(id);
    if (!isFile(file)) return null;
    try {
      const parsed = proposalSchema.safeParse(readJsonFile(file));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async saveProposal(id: string, proposal: Proposal): Promise<void> {
    writeJsonAtomic(this.proposalFile(id), proposal);
  }
}
