import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../../auth/auth.guard';
import { GenerationOrchestrator } from '../../ai/orchestrator/generation-orchestrator';
import { CreateReplyPackRequest } from './dto/create-reply-pack-request.dto';
import { ReplyPackResponse } from './dto/reply-pack-response.dto';
import { normalizeReplyPackRequest } from './mappers/legacy-request.mapper';
import { RequestContext } from '../../common/types/request-context.types';

@UseGuards(AuthGuard)
@Controller('reply-packs')
export class ReplyPacksController {
  constructor(private readonly orchestrator: GenerationOrchestrator) {}

  @Post()
  async create(
    @Body() dto: CreateReplyPackRequest,
    @Req() req: AuthenticatedRequest & { requestId?: string },
  ): Promise<ReplyPackResponse> {
    const rawIdempotencyHeader = req.headers['idempotency-key'];
    const idempotencyKey =
      typeof rawIdempotencyHeader === 'string'
        ? rawIdempotencyHeader
        : Array.isArray(rawIdempotencyHeader)
          ? rawIdempotencyHeader[0]
          : undefined;

    const request = normalizeReplyPackRequest(dto);

    const context: RequestContext = {
      requestId: req.requestId ?? '',
      userId: req.user?.userId,
      postId: request.post.postId,
      idempotencyKey,
    };

    return this.orchestrator.generate(request, context);
  }
}
