import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../../domain/errors';

/**
 * File access for the local adapters. Every path is resolved inside an
 * allowed root; writes go to a temp file first and are then renamed into
 * place, so a crash never leaves a half-written file. Nothing here deletes.
 */
export function within(root: string, ...segments: string[]): string {
  for (const s of segments) {
    if (!s || s.includes('\0') || s.split(/[\\/]/).some((part) => part === '..')) {
      throw new AppError('BAD_PATH', 'That file location is not allowed.');
    }
  }
  const full = path.resolve(root, ...segments);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AppError('BAD_PATH', 'That file location is not allowed.');
  }
  return full;
}

export function writeFileAtomic(file: string, contents: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
