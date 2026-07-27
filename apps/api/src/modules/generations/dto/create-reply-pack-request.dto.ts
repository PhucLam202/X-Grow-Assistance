import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

import { PostDto } from './post.dto';
import { ReplyOptionsDto } from './reply-options.dto';

export { PostAuthorDto, PostDto, PostMediaDto } from './post.dto';
export { ReplyOptionsDto } from './reply-options.dto';
export type { ResolvedReplyOptions } from './reply-options.dto';

export class CreateReplyPackRequest {
  @ValidateNested()
  @Type(() => PostDto)
  post: PostDto;

  /** Thiếu `options` là hợp lệ — toàn bộ default áp ở `resolveReplyOptions()`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReplyOptionsDto)
  options?: ReplyOptionsDto;
}
