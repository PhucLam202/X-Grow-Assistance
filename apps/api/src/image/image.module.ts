import { Module } from '@nestjs/common';
import { ImageFetchService } from './image-fetch.service';

@Module({
  providers: [ImageFetchService],
  exports: [ImageFetchService],
})
export class ImageModule {}
