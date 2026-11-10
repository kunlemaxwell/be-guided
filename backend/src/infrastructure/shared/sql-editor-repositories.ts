import type {
  ConnectorKeyRecord,
  ConnectorKeyRepository,
  PendingChangeRecord,
  PendingChangeRepository,
  SqlDatabase,
  UploadTicketRecord,
  UploadTicketRepository,
} from '../../application/ports';

/** SQL adapters for the editor connector (node:sqlite and D1). Every query is parameterised. */

interface KeyRow {
  id: string;
  person_id: string;
  label: string;
  key_prefix: string;
  key_hash: string;
  products: string | null;
  created_at: string;
  created_by: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

function toKey(r: KeyRow): ConnectorKeyRecord {
  return {
    id: r.id,
    personId: r.person_id,
    label: r.label,
    prefix: r.key_prefix,
    hash: r.key_hash,
    products: r.products ? (JSON.parse(r.products) as string[]) : null,
    createdAt: r.created_at,
    createdBy: r.created_by,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  };
}

export class SqlConnectorKeyRepository implements ConnectorKeyRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<ConnectorKeyRecord[]> {
    return (await this.db.all<KeyRow>('SELECT * FROM connector_keys ORDER BY revoked_at IS NOT NULL, created_at DESC')).map(toKey);
  }

  async get(id: string): Promise<ConnectorKeyRecord | null> {
    const r = await this.db.first<KeyRow>('SELECT * FROM connector_keys WHERE id = ?', [id]);
    return r ? toKey(r) : null;
  }

  async findByHash(hash: string): Promise<ConnectorKeyRecord | null> {
    const r = await this.db.first<KeyRow>('SELECT * FROM connector_keys WHERE key_hash = ?', [hash]);
    return r ? toKey(r) : null;
  }

  async insert(k: ConnectorKeyRecord): Promise<void> {
    await this.db.run(
      'INSERT INTO connector_keys (id, person_id, label, key_prefix, key_hash, products, created_at, created_by, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [k.id, k.personId, k.label, k.prefix, k.hash, k.products ? JSON.stringify(k.products) : null, k.createdAt, k.createdBy, k.lastUsedAt, k.revokedAt],
    );
  }

  async revoke(id: string, at: string): Promise<void> {
    await this.db.run('UPDATE connector_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [at, id]);
  }

  async touch(id: string, at: string): Promise<void> {
    await this.db.run('UPDATE connector_keys SET last_used_at = ? WHERE id = ?', [at, id]);
  }
}

interface ChangeRow {
  id: string;
  kind: 'create' | 'save';
  product: string;
  module: string;
  slug: string;
  frontmatter: string;
  body: string;
  note: string;
  author_id: string | null;
  author_name: string;
  created_at: string;
  status: PendingChangeRecord['status'];
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  revisions: number | null;
}

function toChange(r: ChangeRow): PendingChangeRecord {
  return {
    id: r.id,
    kind: r.kind,
    product: r.product,
    module: r.module,
    slug: r.slug,
    frontmatter: JSON.parse(r.frontmatter) as Record<string, unknown>,
    body: r.body,
    note: r.note,
    authorId: r.author_id,
    authorName: r.author_name,
    createdAt: r.created_at,
    status: r.status,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    revisions: r.revisions ?? 1,
  };
}

export class SqlPendingChangeRepository implements PendingChangeRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(status?: PendingChangeRecord['status']): Promise<PendingChangeRecord[]> {
    const rows = status
      ? await this.db.all<ChangeRow>('SELECT * FROM pending_changes WHERE status = ? ORDER BY created_at DESC LIMIT 200', [status])
      : await this.db.all<ChangeRow>('SELECT * FROM pending_changes ORDER BY created_at DESC LIMIT 200');
    return rows.map(toChange);
  }

  async get(id: string): Promise<PendingChangeRecord | null> {
    const r = await this.db.first<ChangeRow>('SELECT * FROM pending_changes WHERE id = ?', [id]);
    return r ? toChange(r) : null;
  }

  async insert(c: PendingChangeRecord): Promise<void> {
    await this.db.run(
      'INSERT INTO pending_changes (id, kind, product, module, slug, frontmatter, body, note, author_id, author_name, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [c.id, c.kind, c.product, c.module, c.slug, JSON.stringify(c.frontmatter), c.body, c.note, c.authorId, c.authorName, c.createdAt, c.status],
    );
  }

  /** Only a pending change can be decided; false when it was already decided (no double approval). */
  async decide(id: string, status: 'approved' | 'rejected', by: string, at: string, note: string | null): Promise<boolean> {
    const r = await this.db.run(
      "UPDATE pending_changes SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'pending'",
      [status, by, at, note, id],
    );
    return r.changes > 0;
  }

  async revise(id: string, next: { frontmatter: Record<string, unknown>; body: string; note: string; at: string }): Promise<boolean> {
    const r = await this.db.run(
      "UPDATE pending_changes SET frontmatter = ?, body = ?, note = ?, created_at = ?, revisions = revisions + 1 WHERE id = ? AND status = 'pending'",
      [JSON.stringify(next.frontmatter), next.body, next.note, next.at, id],
    );
    return r.changes > 0;
  }
}

interface TicketRow {
  id: string;
  token_hash: string;
  key_id: string;
  person_id: string;
  product: string;
  module: string;
  kind: 'image' | 'video';
  file_name: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export class SqlUploadTicketRepository implements UploadTicketRepository {
  constructor(private readonly db: SqlDatabase) {}

  async insert(t: UploadTicketRecord): Promise<void> {
    await this.db.run(
      'INSERT INTO upload_tickets (id, token_hash, key_id, person_id, product, module, kind, file_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [t.id, t.tokenHash, t.keyId, t.personId, t.product, t.module, t.kind, t.fileName, t.createdAt, t.expiresAt],
    );
  }

  async findByHash(hash: string): Promise<UploadTicketRecord | null> {
    const r = await this.db.first<TicketRow>('SELECT * FROM upload_tickets WHERE token_hash = ?', [hash]);
    return r
      ? { id: r.id, tokenHash: r.token_hash, keyId: r.key_id, personId: r.person_id, product: r.product, module: r.module, kind: r.kind, fileName: r.file_name, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at }
      : null;
  }

  async use(id: string, at: string): Promise<boolean> {
    const r = await this.db.run('UPDATE upload_tickets SET used_at = ? WHERE id = ? AND used_at IS NULL', [at, id]);
    return r.changes > 0;
  }
}
