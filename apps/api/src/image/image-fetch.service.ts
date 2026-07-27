import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';
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
  'twimg.com',
];

function isBlockedIpv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

export function isBlockedIp(ipString: string): boolean {
  const ip = ipString.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:10.0.0.1)
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.substring(7);
    if (mapped.includes('.')) {
      return isBlockedIpv4(mapped);
    }
  }

  // Direct IPv4
  if (ip.includes('.')) {
    return isBlockedIpv4(ip);
  }

  // IPv6 Loopback
  if (ip === '::' || ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;

  // IPv6 Unique Local (fc00::/7 -> fc.. or fd..)
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;

  // IPv6 Link-Local (fe80::/10 -> fe8.., fe9.., fea.., feb..)
  if (
    ip.startsWith('fe8') ||
    ip.startsWith('fe9') ||
    ip.startsWith('fea') ||
    ip.startsWith('feb')
  ) {
    return true;
  }

  return false;
}

export function isHostAllowed(
  hostname: string,
  allowedHosts: string[],
): boolean {
  const lowerHost = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const cleanAllowed = allowed.toLowerCase().replace(/^\*?\./, '');
    return lowerHost === cleanAllowed || lowerHost.endsWith('.' + cleanAllowed);
  });
}

export function sanitizeUrlForLog(rawUrl: string | URL): string {
  try {
    const parsed = typeof rawUrl === 'string' ? new URL(rawUrl) : rawUrl;
    return parsed.hostname;
  } catch {
    return '[invalid-url]';
  }
}

export function detectImageFormatFromMagicBytes(
  buffer: Buffer,
): NormalizedImage['contentType'] {
  if (buffer.length < 12) {
    throw new Error('Image buffer too small for signature verification');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = pngMagic.every((byte, idx) => buffer[idx] === byte);
  if (isPng) return 'image/png';

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF (0-3) && WEBP (8-11)
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46;
  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;
  if (isRiff && isWebp) return 'image/webp';

  throw new Error('Invalid image file signature (magic bytes check failed)');
}

/**
 * ImageFetchService
 *
 * Note on DNS-Rebinding Protection:
 * Pre-resolution (via dns.lookup with { all: true }) and redirect URL/IP validation act as
 * effective mitigations against SSRF. However, because standard Node.js fetch() performs its own
 * DNS resolution when initiating the HTTP connection (without IP pinning/custom Agent binding),
 * there remains a theoretical residual DNS-rebinding window if the DNS server returns a public IP
 * during pre-resolution and subsequently returns a private IP during fetch().
 */
@Injectable()
export class ImageFetchService {
  private readonly logger = new Logger(ImageFetchService.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchImages(inputs: ImageFetchInput[]): Promise<NormalizedImage[]> {
    return Promise.all(inputs.map((input) => this.fetchImage(input)));
  }

  async fetchImage(input: ImageFetchInput): Promise<NormalizedImage> {
    const url = await this.parseAndValidateUrlWithDns(input.url);
    const maxSizeBytes = this.getMaxSizeBytes();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      this.logger.log(`Fetching image from host: ${sanitizeUrlForLog(url)}`);

      const { response, finalUrl } = await this.fetchWithValidatedRedirects(
        url,
        controller.signal,
      );

      if (!response.ok) {
        throw new Error(`Image fetch failed with status ${response.status}`);
      }

      const contentTypeHeader = response.headers.get('content-type');
      if (!contentTypeHeader) {
        throw new Error('Image response is missing Content-Type header');
      }

      const headerContentType = this.normalizeContentType(contentTypeHeader);

      const buffer = await this.readStreamWithLimit(
        response,
        maxSizeBytes,
        controller,
      );

      const detectedType = detectImageFormatFromMagicBytes(buffer);

      if (headerContentType !== detectedType) {
        throw new Error(
          `Content-Type header (${headerContentType}) does not match image signature (${detectedType})`,
        );
      }

      return {
        sourceUrl: finalUrl.toString(),
        contentType: detectedType,
        sizeBytes: buffer.byteLength,
        base64: buffer.toString('base64'),
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
    const maxRedirects = this.getMaxRedirects();

    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount += 1
    ) {
      const response = await fetch(url.toString(), {
        redirect: 'manual',
        signal,
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, finalUrl: url };
      }

      if (redirectCount >= maxRedirects) {
        throw new Error('Image redirected too many times');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Image redirect is missing a location header');
      }

      const nextRawUrl = new URL(location, url).toString();
      url = await this.parseAndValidateUrlWithDns(nextRawUrl);
    }

    throw new Error('Image redirected too many times');
  }

  private async parseAndValidateUrlWithDns(rawUrl: string): Promise<URL> {
    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error('Image URL is invalid');
    }

    if (url.protocol !== 'https:') {
      throw new Error('Image URL must use https');
    }

    if (!isHostAllowed(url.hostname, this.getAllowedHosts())) {
      throw new Error(`Image host is not allowed: ${url.hostname}`);
    }

    await this.validateDnsPreResolution(url.hostname);

    return url;
  }

  private async validateDnsPreResolution(hostname: string): Promise<void> {
    let addresses: Array<{ address: string; family: number }>;

    try {
      const resolved = (await lookup(hostname, {
        all: true,
      })) as unknown as
        | Array<{ address: string; family: number }>
        | { address: string; family: number };

      addresses = Array.isArray(resolved) ? resolved : [resolved];
    } catch (error) {
      throw new Error(
        `DNS resolution failed for host ${sanitizeUrlForLog(hostname)}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    if (!addresses || addresses.length === 0) {
      throw new Error(
        `DNS resolution returned no addresses for host ${sanitizeUrlForLog(hostname)}`,
      );
    }

    for (const entry of addresses) {
      if (isBlockedIp(entry.address)) {
        throw new Error(
          `Image host resolves to a forbidden IP address: ${entry.address}`,
        );
      }
    }
  }

  private async readStreamWithLimit(
    response: Response,
    maxSizeBytes: number,
    controller: AbortController,
  ): Promise<Buffer> {
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!isNaN(contentLength) && contentLength > maxSizeBytes) {
        controller.abort();
        throw new Error('Image is larger than the allowed limit');
      }
    }

    const chunks: Uint8Array[] = [];
    let accumulatedBytes = 0;

    if (response.body) {
      const asyncBody = response.body as unknown as AsyncIterable<Uint8Array>;
      try {
        for await (const chunk of asyncBody) {
          const uint8 = Buffer.from(chunk);
          accumulatedBytes += uint8.byteLength;
          if (accumulatedBytes > maxSizeBytes) {
            controller.abort();
            throw new Error('Image is larger than the allowed limit');
          }
          chunks.push(uint8);
        }
      } catch (err) {
        controller.abort();
        throw err;
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > maxSizeBytes) {
        throw new Error('Image is larger than the allowed limit');
      }
      return Buffer.from(arrayBuffer);
    }

    return Buffer.concat(chunks);
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
      this.configService.get<string>('IMAGE_FETCH_TIMEOUT_MS', '5000'),
    );
  }

  private getMaxRedirects(): number {
    return Number(this.configService.get<string>('IMAGE_MAX_REDIRECTS', '2'));
  }
}
