import type { PublishResultDto, PublishStatusDto } from '../../../../admin/shared/api-types';
import type { Publisher } from '../../application/ports';
import { AppError } from '../../domain/errors';

/**
 * Cloudflare publishing: saves already commit to GitHub, so publishing just
 * asks Cloudflare Pages to rebuild the public site (a deploy hook URL).
 */
export class DeployHookPublisher implements Publisher {
  constructor(
    private readonly hookUrl: string | null,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async status(): Promise<PublishStatusDto> {
    if (!this.hookUrl) return { canPublish: false, message: 'Publishing is not set up yet: the site rebuild link (deploy hook) is missing.' };
    return { canPublish: true, message: 'Your saves are already stored in GitHub. Publishing rebuilds the public site with them (takes a few minutes).' };
  }

  async publish(): Promise<PublishResultDto> {
    if (!this.hookUrl) throw new AppError('NOT_CONFIGURED', 'Publishing is not set up yet: the site rebuild link (deploy hook) is missing.');
    const res = await this.fetcher(this.hookUrl, { method: 'POST' });
    if (!res.ok) throw new AppError('PUBLISH_FAILED', 'Cloudflare did not accept the rebuild request. Nothing changed on the live site. Try again.');
    return { message: 'Published. The live site will show your changes in a few minutes.' };
  }
}
