export type ImageFetchInput = {
  url: string;
  altText?: string;
};

export type NormalizedImage = {
  sourceUrl: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  base64: string;
  altText?: string;
};
