import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

export class PostAuthorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  handle?: string;
}

export class PostMediaDto {
  @IsIn(['image', 'video', 'gif'])
  type: 'image' | 'video' | 'gif';

  @IsUrl({ require_tld: false })
  url: string;

  /** Accessibility text. Feeds niche detection when present. */
  @IsOptional()
  @IsString()
  altText?: string;
}

export class PostDto {
  @IsIn(['x'])
  platform: 'x';

  /** `id` là alias của `postId` (contract mới). Mapper chuẩn hoá về `postId`. */
  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  /**
   * Optional: post chỉ có ảnh vẫn hợp lệ. Ràng buộc "phải có ít nhất một nguồn
   * ngữ cảnh" được kiểm ở `assertPostContext()` để trả về `INVALID_POST_CONTEXT`
   * thay vì lỗi field-level.
   */
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  hashtags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PostAuthorDto)
  author?: PostAuthorDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PostMediaDto)
  media?: PostMediaDto[];

  @IsOptional()
  @IsIn(['text', 'image', 'video', 'mixed', 'unknown'])
  contentType?: 'text' | 'image' | 'video' | 'mixed' | 'unknown';

  @IsOptional()
  @IsIn(['original', 'reply', 'quote', 'repost'])
  postType?: 'original' | 'reply' | 'quote' | 'repost';

  @IsOptional()
  @IsString()
  capturedAt?: string;

  @IsOptional()
  @IsString()
  extractorVersion?: string;
}
