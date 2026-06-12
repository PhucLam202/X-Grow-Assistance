import { Body, Controller, Post } from '@nestjs/common';
import { GenerateReplyPackDto } from './dto/generate-reply-pack.dto';
import { ReplyPackService } from './reply-pack.service';

@Controller('generate-reply-pack')
export class ReplyPackController {
  constructor(private readonly replyPackService: ReplyPackService) {}

  @Post()
  generate(@Body() dto: GenerateReplyPackDto) {
    return this.replyPackService.generate(dto);
  }
}
