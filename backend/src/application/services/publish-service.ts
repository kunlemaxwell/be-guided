import type { PublishResultDto, PublishStatusDto } from '../../../../admin/shared/api-types';
import type { RequestContext } from '../../domain/actor';
import { AppError } from '../../domain/errors';
import type { Publisher } from '../ports';
import type { ActivityService } from './activity-service';

/** Publishing the guide, with every attempt in the audit log (including failures). */
export class PublishService {
  constructor(
    private readonly publisher: Publisher,
    private readonly activity: ActivityService,
  ) {}

  status(): Promise<PublishStatusDto> {
    return this.publisher.status();
  }

  async publish(ctx: RequestContext): Promise<PublishResultDto> {
    try {
      const result = await this.publisher.publish();
      await this.activity.record(ctx, { area: 'publish', action: 'publish.success', target: 'site', summary: 'Published the guide' });
      return result;
    } catch (error) {
      if (error instanceof AppError) {
        await this.activity.record(ctx, { area: 'publish', action: 'publish.failed', target: 'site', summary: `Publish did not go ahead: ${error.message}`, details: { code: error.code } });
      }
      throw error;
    }
  }
}
