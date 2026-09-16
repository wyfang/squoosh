export type OutputFormat = 'webp' | 'jpeg' | 'avif' | 'png';

export interface EncodeSettings {
  format: OutputFormat;
  quality: number;
  /** Percentage: 100 preserves the original dimensions. */
  scale: number;
  lossless: boolean;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface EncodeResult extends ImageDimensions {
  blob: Blob;
  /** Milliseconds, including decoding and loading the selected codec. */
  duration: number;
}

export const MAX_IMAGE_PIXELS = 100_000_000;
export const MAX_IMAGE_EDGE = 16_383;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

export const FORMAT_MIME: Record<OutputFormat, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  png: 'image/png',
};

export type CodecRequest =
  | { kind: 'read'; file: File }
  | { kind: 'encode'; file: File; settings: EncodeSettings };

export type CodecResponse =
  | { ok: true; result: ImageDimensions | EncodeResult }
  | { ok: false; message: string };
