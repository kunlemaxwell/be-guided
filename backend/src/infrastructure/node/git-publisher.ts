import { execFile } from 'node:child_process';
import type { PublishResultDto, PublishStatusDto } from '../../../../admin/shared/api-types';
import type { Publisher } from '../../application/ports';
import { AppError } from '../../domain/errors';

const NOT_CONNECTED =
  'Your changes are saved on this computer and the local site already shows them; publishing goes live once the GitHub organisation repository is connected.';

interface GitResult {
  ok: boolean;
  stdout: string;
}

function git(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    // execFile: no shell, fixed arguments.
    execFile('git', args, { cwd, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout) });
    });
  });
}

/** Local publishing = commit the content folder and push it. Never forces. "Not connected" when there is no repo/remote. */
export class GitPublisher implements Publisher {
  constructor(private readonly repoRoot: string) {}

  async status(): Promise<PublishStatusDto> {
    const inside = await git(this.repoRoot, ['rev-parse', '--is-inside-work-tree']);
    if (!inside.ok || inside.stdout.trim() !== 'true') return { canPublish: false, message: NOT_CONNECTED };
    const remotes = await git(this.repoRoot, ['remote']);
    if (!remotes.ok || !remotes.stdout.trim()) return { canPublish: false, message: NOT_CONNECTED };
    return { canPublish: true, message: 'Publishing sends your saved guide changes to GitHub, and the live site updates from there.' };
  }

  async publish(): Promise<PublishResultDto> {
    const status = await this.status();
    if (!status.canPublish) throw new AppError('NOT_ALLOWED', status.message);
    const add = await git(this.repoRoot, ['add', 'content']);
    if (!add.ok) throw new AppError('PUBLISH_FAILED', "Your changes couldn't be prepared for publishing. Nothing was sent.");
    const staged = await git(this.repoRoot, ['diff', '--cached', '--quiet', '--', 'content']);
    if (staged.ok) throw new AppError('NOTHING_TO_PUBLISH', 'Everything is already published — there are no new changes.');
    const commit = await git(this.repoRoot, ['commit', '-m', 'Guide update', '--', 'content']);
    if (!commit.ok) throw new AppError('PUBLISH_FAILED', "Your changes couldn't be saved for publishing. Nothing was sent.");
    const push = await git(this.repoRoot, ['push']);
    if (!push.ok) {
      throw new AppError('PUBLISH_FAILED', "Your changes are ready but couldn't be sent to GitHub (check the internet connection, then try Publish again).");
    }
    return { message: 'Published. The live site will show your changes in a few minutes.' };
  }
}
