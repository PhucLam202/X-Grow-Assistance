import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LanguageModule } from '../common/language/language.module';
import { ReplyPackController } from './reply-pack.controller';
import { ReplyPackService } from './reply-pack.service';

@Module({
  imports: [AiModule, LanguageModule],
  controllers: [ReplyPackController],
  providers: [ReplyPackService],
})
export class ReplyPackModule {}
