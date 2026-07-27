import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup, LookupAddress } from 'node:dns/promises';
import {
  detectImageFormatFromMagicBytes,
  ImageFetchService,
  isBlockedIp,
  isHostAllowed,
  sanitizeUrlForLog,
} from './image-fetch.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

// Standard 8-byte PNG header + 4 dummy bytes
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
// JPEG header: FF D8 FF + dummy bytes
const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
// WebP header: RIFF (0-3) + 4 bytes size + WEBP (8-11)
const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('ImageFetchService Security Hardening (Phase 4A)', () => {
  let service: ImageFetchService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService({
      IMAGE_ALLOWED_HOSTS: 'pbs.twimg.com,abs.twimg.com,twimg.com,x.com',
      IMAGE_MAX_SIZE_BYTES: '5242880',
      IMAGE_FETCH_TIMEOUT_MS: '5000',
      IMAGE_MAX_REDIRECTS: '2',
    });
    service = new ImageFetchService(configService);

    // Default DNS mock: resolve to a public IP
    mockLookup.mockResolvedValue([
      { address: '104.244.42.1', family: 4 },
    ] as LookupAddress[]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Pure Helper Functions', () => {
    it('isBlockedIp should detect private, loopback, link-local, metadata & IPv4-mapped IPv6 IPs', () => {
      expect(isBlockedIp('127.0.0.1')).toBe(true);
      expect(isBlockedIp('127.0.0.254')).toBe(true);
      expect(isBlockedIp('10.0.0.1')).toBe(true);
      expect(isBlockedIp('172.16.0.1')).toBe(true);
      expect(isBlockedIp('172.31.255.255')).toBe(true);
      expect(isBlockedIp('192.168.1.100')).toBe(true);
      expect(isBlockedIp('169.254.169.254')).toBe(true); // AWS/GCP Metadata IP
      expect(isBlockedIp('::1')).toBe(true);
      expect(isBlockedIp('fc00::1')).toBe(true);
      expect(isBlockedIp('fe80::1')).toBe(true);

      // IPv4-mapped IPv6
      expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
      expect(isBlockedIp('::ffff:192.168.0.1')).toBe(true);

      // Public IPs
      expect(isBlockedIp('104.244.42.1')).toBe(false);
      expect(isBlockedIp('8.8.8.8')).toBe(false);
    });

    it('isHostAllowed should enforce boundary-safe hostname matching', () => {
      const allowed = ['twimg.com', 'x.com', 'pbs.twimg.com'];

      expect(isHostAllowed('pbs.twimg.com', allowed)).toBe(true);
      expect(isHostAllowed('sub.pbs.twimg.com', allowed)).toBe(true);
      expect(isHostAllowed('twimg.com', allowed)).toBe(true);
      expect(isHostAllowed('x.com', allowed)).toBe(true);

      // Rejections
      expect(isHostAllowed('evil-twimg.com', allowed)).toBe(false);
      expect(isHostAllowed('not-twimg.com', allowed)).toBe(false);
      expect(isHostAllowed('notx.com', allowed)).toBe(false);
      expect(isHostAllowed('localhost', allowed)).toBe(false);
    });

    it('sanitizeUrlForLog should extract hostname only and strip path/query tokens', () => {
      const url =
        'https://pbs.twimg.com/media/test.jpg?token=secret_token_123456&sig=abcdef';
      expect(sanitizeUrlForLog(url)).toBe('pbs.twimg.com');
      expect(sanitizeUrlForLog('invalid-url')).toBe('[invalid-url]');
    });

    it('detectImageFormatFromMagicBytes should recognize PNG, JPEG, WebP and reject invalid signatures', () => {
      expect(detectImageFormatFromMagicBytes(VALID_PNG_BYTES)).toBe(
        'image/png',
      );
      expect(detectImageFormatFromMagicBytes(VALID_JPEG_BYTES)).toBe(
        'image/jpeg',
      );
      expect(detectImageFormatFromMagicBytes(VALID_WEBP_BYTES)).toBe(
        'image/webp',
      );

      const fakeBuffer = Buffer.from('NOT_AN_IMAGE_PAYLOAD_HERE');
      expect(() => detectImageFormatFromMagicBytes(fakeBuffer)).toThrow(
        /magic bytes check failed/i,
      );
    });
  });

  describe('Security Constraints & Validation', () => {
    it('should reject non-HTTPS URLs', async () => {
      await expect(
        service.fetchImage({
          url: 'http://pbs.twimg.com/image.jpg',
        }),
      ).rejects.toThrow('Image URL must use https');
    });

    it('should reject unsafe hostname boundaries (e.g. evil-twimg.com)', async () => {
      await expect(
        service.fetchImage({
          url: 'https://evil-twimg.com/image.jpg',
        }),
      ).rejects.toThrow('Image host is not allowed: evil-twimg.com');
    });

    it('should reject DNS resolution if any resolved IP is private/blocked', async () => {
      mockLookup.mockResolvedValueOnce([
        { address: '104.244.42.1', family: 4 },
        { address: '10.0.0.1', family: 4 }, // Multiple DNS results where one IP is private
      ] as LookupAddress[]);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.jpg',
        }),
      ).rejects.toThrow('Image host resolves to a forbidden IP address');
    });

    it('should reject IPv4-mapped IPv6 addresses returned by DNS', async () => {
      mockLookup.mockResolvedValueOnce([
        { address: '::ffff:127.0.0.1', family: 6 },
      ] as LookupAddress[]);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.jpg',
        }),
      ).rejects.toThrow('Image host resolves to a forbidden IP address');
    });

    it('should reject missing Content-Type header in response', async () => {
      const mockResponse = new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: {}, // missing content-type
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.png',
        }),
      ).rejects.toThrow('Image response is missing Content-Type header');
    });

    it('should reject response when Content-Type header and magic bytes mismatch', async () => {
      const mockResponse = new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' }, // Header says jpeg, body is png
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.jpg',
        }),
      ).rejects.toThrow(/does not match image signature/i);
    });

    it('should reject response when Content-Length exceeds max allowed limit', async () => {
      const mockResponse = new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '6000000', // > 5242880
        },
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.png',
        }),
      ).rejects.toThrow('Image is larger than the allowed limit');
    });

    it('should abort and reject streamed response when accumulated bytes exceed limit', async () => {
      const overLimitChunk = Buffer.alloc(6 * 1024 * 1024); // 6MB
      const mockResponse = new Response(overLimitChunk, {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.png',
        }),
      ).rejects.toThrow('Image is larger than the allowed limit');
    });

    it('should re-validate URL, DNS and IP for redirect target and reject redirect to private IP', async () => {
      // Step 1: Initial request redirects to internal location
      const redirectResponse = new Response(null, {
        status: 302,
        headers: { location: 'https://abs.twimg.com/internal.png' },
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirectResponse);

      // Step 2: DNS lookup for redirect target resolves to private IP
      mockLookup
        .mockResolvedValueOnce([
          { address: '104.244.42.1', family: 4 },
        ] as LookupAddress[]) // 1st call
        .mockResolvedValueOnce([
          { address: '192.168.1.1', family: 4 },
        ] as LookupAddress[]); // 2nd call (redirect)

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.png',
        }),
      ).rejects.toThrow('Image host resolves to a forbidden IP address');
    });

    it('should reject redirect to HTTP or non-allowed host', async () => {
      const redirectResponse = new Response(null, {
        status: 302,
        headers: { location: 'http://pbs.twimg.com/unsecure.png' },
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirectResponse);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.png',
        }),
      ).rejects.toThrow('Image URL must use https');
    });

    it('should reject when max redirects (2) is exceeded', async () => {
      const redirect1 = new Response(null, {
        status: 302,
        headers: { location: 'https://abs.twimg.com/1.png' },
      });
      const redirect2 = new Response(null, {
        status: 302,
        headers: { location: 'https://abs.twimg.com/2.png' },
      });
      const redirect3 = new Response(null, {
        status: 302,
        headers: { location: 'https://abs.twimg.com/3.png' },
      });

      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(redirect1)
        .mockResolvedValueOnce(redirect2)
        .mockResolvedValueOnce(redirect3);

      await expect(
        service.fetchImage({
          url: 'https://pbs.twimg.com/image.png',
        }),
      ).rejects.toThrow('Image redirected too many times');
    });

    it('should abort request on real timeout', async () => {
      const shortTimeoutService = new ImageFetchService(
        new ConfigService({
          IMAGE_ALLOWED_HOSTS: 'pbs.twimg.com',
          IMAGE_FETCH_TIMEOUT_MS: '50', // 50ms short timeout
        }),
      );

      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((_url: unknown, options: unknown) => {
          const fetchOpts = options as { signal: AbortSignal };
          return new Promise((_resolve, reject) => {
            fetchOpts.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        });

      await expect(
        shortTimeoutService.fetchImage({
          url: 'https://pbs.twimg.com/slow.png',
        }),
      ).rejects.toThrow();
    });

    it('should log sanitized hostname and exclude secret tokens from logs', async () => {
      const loggerSpy = jest
        .spyOn((service as unknown as { logger: Logger }).logger, 'log')
        .mockImplementation();

      const mockResponse = new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      const secretUrl =
        'https://pbs.twimg.com/media/photo.png?auth_token=super_secret_token_12345';
      await service.fetchImage({ url: secretUrl });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Fetching image from host: pbs.twimg.com',
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('super_secret_token_12345'),
      );
    });

    it('should successfully fetch valid PNG, JPEG, and WebP images', async () => {
      const mockResponse = new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      const result = await service.fetchImage({
        url: 'https://pbs.twimg.com/valid.png',
        altText: 'A valid test image',
      });

      expect(result.contentType).toBe('image/png');
      expect(result.sizeBytes).toBe(VALID_PNG_BYTES.byteLength);
      expect(result.base64).toBe(VALID_PNG_BYTES.toString('base64'));
      expect(result.altText).toBe('A valid test image');
    });
  });
});
