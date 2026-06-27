import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageFetchInput, NormalizedImage } from './image.types';

const SUPPORTED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
const DEFAULT_ALLOWED_HOSTS = [
  'pbs.twimg.com',
  'abs.twimg.com',
  'ton.twimg.com',
  'x.com',
  'twitter.com',
];

@Injectable()
export class ImageFetchService {
  constructor(private readonly configService: ConfigService) {}

  async fetchImages(inputs: ImageFetchInput[]): Promise<NormalizedImage[]> {
    return Promise.all(inputs.map((input) => this.fetchImage(input)));
  }

  async fetchImage(input: ImageFetchInput): Promise<NormalizedImage> {
    const url = this.parseAndValidateUrl(input.url);
    const maxSizeBytes = this.getMaxSizeBytes();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const { response, finalUrl } = await this.fetchWithValidatedRedirects(
        url,
        controller.signal,
      );

      if (!response.ok) {
        throw new Error(`Image fetch failed with status ${response.status}`);
      }

      const contentType = this.normalizeContentType(
        response.headers.get('content-type'),
      );
      const contentLength = Number(
        response.headers.get('content-length') ?? '0',
      );

      if (contentLength > maxSizeBytes) {
        throw new Error('Image is larger than the allowed limit');
      }

      const arrayBuffer = await response.arrayBuffer();
      const sizeBytes = arrayBuffer.byteLength;

      if (sizeBytes > maxSizeBytes) {
        throw new Error('Image is larger than the allowed limit');
      }

      return {
        sourceUrl: finalUrl.toString(),
        contentType,
        sizeBytes,
        base64: Buffer.from(arrayBuffer).toString('base64'),
        altText: input.altText,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchWithValidatedRedirects(
    initialUrl: URL,
    signal: AbortSignal,
  ): Promise<{ response: Response; finalUrl: URL }> {
    let url = initialUrl;

    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      const response = await fetch(url.toString(), {
        redirect: 'manual',
        signal,
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, finalUrl: url };
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Image redirect is missing a location header');
      }

      url = this.parseAndValidateUrl(new URL(location, url).toString());
    }

    throw new Error('Image redirected too many times');
  }

  private parseAndValidateUrl(rawUrl: string): URL {
    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error('Image URL is invalid');
    }

    if (url.protocol !== 'https:') {
      throw new Error('Image URL must use https');
    }

    if (!this.getAllowedHosts().includes(url.hostname)) {
      throw new Error(`Image host is not allowed: ${url.hostname}`);
    }

    return url;
  }

  private normalizeContentType(
    contentTypeHeader: string | null,
  ): NormalizedImage['contentType'] {
    const contentType = contentTypeHeader?.split(';')[0]?.trim().toLowerCase();

    if (
      SUPPORTED_CONTENT_TYPES.some((supported) => supported === contentType)
    ) {
      return contentType as NormalizedImage['contentType'];
    }

    throw new Error(
      `Unsupported image content type: ${contentType ?? 'unknown'}`,
    );
  }

  private getAllowedHosts(): string[] {
    const configured = this.configService.get<string>('IMAGE_ALLOWED_HOSTS');
    if (!configured) return DEFAULT_ALLOWED_HOSTS;

    return configured
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean);
  }

  private getMaxSizeBytes(): number {
    return Number(
      this.configService.get<string>('IMAGE_MAX_SIZE_BYTES', '5242880'),
    );
  }

  private getTimeoutMs(): number {
    return Number(
      this.configService.get<string>('IMAGE_FETCH_TIMEOUT_MS', '8000'),
    );
  }
}
