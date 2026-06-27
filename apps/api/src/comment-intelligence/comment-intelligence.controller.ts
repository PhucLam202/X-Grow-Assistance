import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AiDriverService } from './ai-driver.service';
import { CommentComposerService } from './composer/comment-composer.service';
import { CommentStrategyEngineService } from './comment-strategy-engine.service';
import { DriverInputDto } from './dto/driver-input.dto';
import { CommentAiHarnessService } from './harness/comment-ai-harness.service';
import { ContextPackageNormalizerService } from './tools/context-package-normalizer.service';

@UseGuards(AuthGuard)
@Controller('comment-intelligence')
export class CommentIntelligenceController {
  constructor(
    private readonly aiDriver: AiDriverService,
    private readonly contextNormalizer: ContextPackageNormalizerService,
    private readonly strategyEngine: CommentStrategyEngineService,
    private readonly commentComposer: CommentComposerService,
    private readonly aiHarness: CommentAiHarnessService,
  ) {}

  @Post('driver/decide')
  decide(@Body() dto: DriverInputDto) {
    return this.aiDriver.decide(
      dto,
      dto.contextState?.isExpanded ? 'final' : 'initial',
    );
  }

  @Post('context/enrich')
  enrichContext(@Body() dto: DriverInputDto) {
    return this.contextNormalizer.enrich(dto);
  }

  @Post('strategy/run')
  runStrategy(@Body() dto: DriverInputDto) {
    return this.strategyEngine.run(dto);
  }

  @Post('composer/generate')
  async generateComments(@Body() dto: DriverInputDto) {
    const strategy = this.strategyEngine.run(dto);
    const composerOutput = await this.commentComposer.compose({
      input: strategy.enrichedInput,
      decision: strategy.finalDecision,
    });

    return {
      ...strategy,
      composerOutput,
    };
  }

  @Post('harness/run')
  runHarness(@Body() dto: DriverInputDto, @CurrentUser() user: AuthUser) {
    return this.aiHarness.run({ ...dto, userId: user.userId });
  }

  @Get('harness/runs/:runId')
  getHarnessRun(@Param('runId') runId: string, @CurrentUser() user: AuthUser) {
    return this.aiHarness.getRun(runId, user.userId);
  }
}
