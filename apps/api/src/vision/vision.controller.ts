import { Body, Controller, Post } from '@nestjs/common';
import { AnalyzeVisionDto } from './dto/analyze-vision.dto';
import { GenerateFromVisionContextDto } from './dto/generate-from-vision-context.dto';
import { VisionAnalyzeService } from './vision-analyze.service';

@Controller('analyze/vision')
export class VisionController {
  constructor(private readonly visionAnalyzeService: VisionAnalyzeService) {}

  @Post()
  analyze(@Body() dto: AnalyzeVisionDto) {
    return this.visionAnalyzeService.analyze(dto);
  }

  @Post('context')
  analyzeContext(@Body() dto: AnalyzeVisionDto) {
    return this.visionAnalyzeService.analyzeContext(dto);
  }

  @Post('context/comments')
  generateFromContext(@Body() dto: GenerateFromVisionContextDto) {
    return this.visionAnalyzeService.generateFromContext(dto);
  }
}
