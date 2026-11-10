import YAML from 'yaml';

/**
 * A guide page file is YAML frontmatter between `---` lines, a blank line,
 * then the markdown body. Dates stay plain YYYY-MM-DD strings (YAML 1.2).
 */
export interface PageFileParts {
  /** The frontmatter exactly as written in the file (without the --- lines). */
  frontmatterSource: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitPageFile(text: string): PageFileParts {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatterSource: '', frontmatter: {}, body: text.trim() };
  const frontmatterSource = match[1] ?? '';
  const parsed: unknown = YAML.parse(frontmatterSource);
  const frontmatter = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  return { frontmatterSource, frontmatter, body: text.slice(match[0].length).trim() };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Writes the frontmatter back, keeping the original formatting of every
 * field that didn't change (comments, quoting, order).
 */
export function updateFrontmatter(originalSource: string, next: Record<string, unknown>): string {
  const doc = YAML.parseDocument(originalSource || '{}');
  const before = (doc.toJS() ?? {}) as Record<string, unknown>;
  if (!originalSource.trim()) {
    return YAML.stringify(next, { lineWidth: 0 });
  }
  for (const key of Object.keys(before)) {
    if (!(key in next)) doc.delete(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      doc.delete(key);
    } else if (!sameValue(before[key], value)) {
      doc.set(key, doc.createNode(value));
    }
  }
  return doc.toString({ lineWidth: 0 });
}

export function joinPageFile(frontmatterYaml: string, body: string): string {
  const fm = frontmatterYaml.endsWith('\n') ? frontmatterYaml : `${frontmatterYaml}\n`;
  const text = body.trim();
  return `---\n${fm}---\n${text ? `\n${text}\n` : ''}`;
}
