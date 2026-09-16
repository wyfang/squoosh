/// <reference path="../emscripten-types.d.ts" />
/**
 * Codec defaults adapted from Squoosh, Copyright 2020 Google Inc.
 * Licensed under the Apache License, Version 2.0.
 * http://www.apache.org/licenses/LICENSE-2.0
 * The original codec sources, binary files, and license remain in this repository.
 */
import webpWasmUrl from '../codecs/webp/enc/webp_enc.wasm?url';
import jpegWasmUrl from '../codecs/mozjpeg/enc/mozjpeg_enc.wasm?url';
import avifWasmUrl from '../codecs/avif/enc/avif_enc.wasm?url';
import pngWasmUrl from '../codecs/oxipng/pkg/squoosh_oxipng_bg.wasm?url';
import type { EncodeOptions as WebPOptions } from '../codecs/webp/enc/webp_enc';
import type { EncodeOptions as JPEGOptions } from '../codecs/mozjpeg/enc/mozjpeg_enc';
import type { EncodeOptions as AVIFOptions } from '../codecs/avif/enc/avif_enc';
import {
  FORMAT_MIME,
  MAX_FILE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PIXELS,
  type CodecRequest,
  type CodecResponse,
  type EncodeResult,
  type EncodeSettings,
  type ImageDimensions,
  type OutputFormat,
} from './types';

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<CodecRequest>) => void;
  postMessage: (message: CodecResponse) => void;
};

const WEBP_DEFAULTS: WebPOptions = {
  quality: 75,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
};
const JPEG_DEFAULTS: JPEGOptions = {
  quality: 75,
  baseline: false,
  arithmetic: false,
  progressive: true,
  optimize_coding: true,
  smoothing: 0,
  color_space: 3,
  quant_table: 3,
  trellis_multipass: false,
  trellis_opt_zero: false,
  trellis_opt_table: false,
  trellis_loops: 1,
  auto_subsample: true,
  chroma_subsample: 2,
  separate_chroma_quality: false,
  chroma_quality: 75,
};
const AVIF_DEFAULTS: AVIFOptions = {
  quality: 50,
  qualityAlpha: -1,
  denoiseLevel: 0,
  tileColsLog2: 0,
  tileRowsLog2: 0,
  speed: 6,
  subsample: 1,
  chromaDeltaQ: false,
  sharpness: 0,
  tune: 0,
  enableSharpYUV: false,
};

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function checkDimensions(width: number, height: number): ImageDimensions {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error('图片尺寸无效');
  }
  if (
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('图片不能超过 2500 万像素，单边不能超过 16383 像素');
  }
  return { width, height };
}

/** Detect animation using container metadata, never trusting the extension/MIME. */
function inspectInput(bytes: Uint8Array) {
  if (bytes.length < 12) throw new Error('图片文件不完整');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (textAt(bytes, 0, 3) === 'GIF') {
    throw new Error('暂不支持 GIF，请先导出为静态 PNG 或 WebP');
  }
  if (bytes[0] === 137 && textAt(bytes, 1, 3) === 'PNG') {
    if (bytes.length < 24) throw new Error('PNG 文件不完整');
    checkDimensions(view.getUint32(16), view.getUint32(20));
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const size = view.getUint32(offset);
      const kind = textAt(bytes, offset + 4, 4);
      if (kind === 'acTL')
        throw new Error('暂不支持动态 PNG，请先导出所需的静态帧');
      if (size > bytes.length - offset - 12) throw new Error('PNG 文件不完整');
      if (kind === 'IEND') break;
      offset += size + 12;
    }
    return;
  }
  if (textAt(bytes, 0, 4) === 'RIFF' && textAt(bytes, 8, 4) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const size = view.getUint32(offset + 4, true);
      if (size > bytes.length - offset - 8) throw new Error('WebP 文件不完整');
      const kind = textAt(bytes, offset, 4);
      const data = offset + 8;
      if (
        kind === 'ANIM' ||
        kind === 'ANMF' ||
        (kind === 'VP8X' && bytes[data] & 2)
      ) {
        throw new Error('暂不支持动态 WebP，请先导出所需的静态帧');
      }
      if (kind === 'VP8X' && size >= 10) {
        const width =
          1 +
          bytes[data + 4] +
          (bytes[data + 5] << 8) +
          (bytes[data + 6] << 16);
        const height =
          1 +
          bytes[data + 7] +
          (bytes[data + 8] << 8) +
          (bytes[data + 9] << 16);
        checkDimensions(width, height);
      } else if (kind === 'VP8 ' && size >= 10) {
        checkDimensions(
          view.getUint16(data + 6, true) & 0x3fff,
          view.getUint16(data + 8, true) & 0x3fff,
        );
      } else if (kind === 'VP8L' && size >= 5) {
        const bits = view.getUint32(data + 1, true);
        checkDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      offset += 8 + size + (size & 1);
    }
    return;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || size > bytes.length - offset)
        throw new Error('JPEG 文件不完整');
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (size < 7) throw new Error('JPEG 尺寸信息无效');
        checkDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += size;
    }
    return;
  }
  if (textAt(bytes, 4, 4) === 'ftyp') {
    const boxSize = view.getUint32(0);
    if (boxSize < 16 || boxSize > bytes.length)
      throw new Error('AVIF 文件不完整');
    const brands = [textAt(bytes, 8, 4)];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4)
      brands.push(textAt(bytes, offset, 4));
    if (brands.includes('avis'))
      throw new Error('暂不支持动态 AVIF，请先导出所需的静态帧');
    if (!brands.includes('avif'))
      throw new Error('此图片格式暂不支持，请使用 PNG、JPEG、WebP 或 AVIF');
    inspectAvifBoxes(bytes, view, 0, bytes.length, 0);
    return;
  }
  if (textAt(bytes, 0, 2) === 'BM' && bytes.length >= 26) {
    const headerSize = view.getUint32(14, true);
    if (headerSize === 12)
      checkDimensions(view.getUint16(18, true), view.getUint16(20, true));
    else if (headerSize >= 40)
      checkDimensions(
        view.getInt32(18, true),
        Math.abs(view.getInt32(22, true)),
      );
    return;
  }
  throw new Error('此图片格式暂不支持，请使用 PNG、JPEG、WebP、AVIF 或 BMP');
}

function inspectAvifBoxes(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  depth: number,
) {
  if (depth > 5) return;
  for (let offset = start; offset + 8 <= end; ) {
    let size = view.getUint32(offset);
    let headerSize = 8;
    const kind = textAt(bytes, offset + 4, 4);
    if (size === 1) {
      if (offset + 16 > end) throw new Error('AVIF 文件不完整');
      const high = view.getUint32(offset + 8);
      if (high !== 0) throw new Error('AVIF 文件尺寸无效');
      size = view.getUint32(offset + 12);
      headerSize = 16;
    } else if (size === 0) size = end - offset;
    if (size < headerSize || size > end - offset)
      throw new Error('AVIF 文件不完整');
    const data = offset + headerSize;
    if (kind === 'moov')
      throw new Error('暂不支持动态 AVIF，请先导出所需的静态帧');
    if (kind === 'ispe' && size >= headerSize + 12)
      checkDimensions(view.getUint32(data + 4), view.getUint32(data + 8));
    if (kind === 'meta' || kind === 'iprp' || kind === 'ipco') {
      inspectAvifBoxes(
        bytes,
        view,
        data + (kind === 'meta' ? 4 : 0),
        offset + size,
        depth + 1,
      );
    }
    offset += size;
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  if (!file.size) throw new Error('图片文件为空');
  if (file.size > MAX_FILE_BYTES) throw new Error('单张图片不能超过 40 MB');
  inspectInput(new Uint8Array(await file.arrayBuffer()));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('无法解码图片，文件可能已损坏或当前浏览器不支持该格式');
  }
  try {
    checkDimensions(bitmap.width, bitmap.height);
    return bitmap;
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

function validateSettings(settings: EncodeSettings) {
  if (!Object.hasOwn(FORMAT_MIME, settings.format))
    throw new Error('不支持的输出格式');
  if (
    !Number.isFinite(settings.quality) ||
    settings.quality < 0 ||
    settings.quality > 100
  ) {
    throw new Error('图片质量需在 0 至 100 之间');
  }
  if (
    !Number.isFinite(settings.scale) ||
    settings.scale < 1 ||
    settings.scale > 100
  ) {
    throw new Error('缩放比例需在 1% 至 100% 之间');
  }
  if (settings.format === 'jpeg' && settings.lossless)
    throw new Error('JPEG 不支持无损编码，请使用 PNG 或 WebP');
}

async function encodePixels(
  data: ImageData,
  settings: EncodeSettings,
): Promise<Uint8Array> {
  const { width, height } = data;
  const quality = Math.round(settings.quality);
  let output: Uint8Array | null;
  switch (settings.format) {
    case 'webp': {
      const { default: createCodec } = await import(
        '../codecs/webp/enc/webp_enc.js'
      );
      const codec = await createCodec({ locateFile: () => webpWasmUrl });
      output = codec.encode(data.data, width, height, {
        ...WEBP_DEFAULTS,
        quality,
        lossless: Number(settings.lossless),
        exact: Number(settings.lossless),
      });
      break;
    }
    case 'jpeg': {
      const { default: createCodec } = await import(
        '../codecs/mozjpeg/enc/mozjpeg_enc.js'
      );
      const codec = await createCodec({ locateFile: () => jpegWasmUrl });
      output = codec.encode(data.data, width, height, {
        ...JPEG_DEFAULTS,
        quality,
      });
      break;
    }
    case 'avif': {
      const { default: createCodec } = await import(
        '../codecs/avif/enc/avif_enc.js'
      );
      const codec = await createCodec({ locateFile: () => avifWasmUrl });
      output = codec.encode(data.data, width, height, {
        ...AVIF_DEFAULTS,
        quality: settings.lossless ? 100 : quality,
        qualityAlpha: settings.lossless ? 100 : -1,
        subsample: settings.lossless ? 3 : AVIF_DEFAULTS.subsample,
      });
      break;
    }
    case 'png': {
      const codec = await import('../codecs/oxipng/pkg/squoosh_oxipng.js');
      await codec.default(pngWasmUrl);
      output = codec.optimise(data.data, width, height, 2, false);
      break;
    }
  }
  if (!output || output.length < 12)
    throw new Error('编码器未生成有效图片，请降低尺寸后重试');
  verifyOutput(output, settings.format);
  return output;
}

function verifyOutput(output: Uint8Array, format: OutputFormat) {
  const valid =
    format === 'jpeg'
      ? output[0] === 0xff &&
        output[1] === 0xd8 &&
        output[output.length - 2] === 0xff &&
        output[output.length - 1] === 0xd9
      : format === 'webp'
        ? textAt(output, 0, 4) === 'RIFF' && textAt(output, 8, 4) === 'WEBP'
        : format === 'png'
          ? output[0] === 137 && textAt(output, 1, 3) === 'PNG'
          : textAt(output, 4, 4) === 'ftyp' && textAt(output, 8, 4) === 'avif';
  if (!valid) throw new Error('编码器返回的格式与所选格式不一致');
}

async function handle(
  request: CodecRequest,
): Promise<ImageDimensions | EncodeResult> {
  const started = performance.now();
  if (request.kind === 'encode') validateSettings(request.settings);
  const bitmap = await decode(request.file);
  try {
    if (request.kind === 'read')
      return { width: bitmap.width, height: bitmap.height };
    const { settings } = request;
    const width = Math.max(
      1,
      Math.round((bitmap.width * settings.scale) / 100),
    );
    const height = Math.max(
      1,
      Math.round((bitmap.height * settings.scale) / 100),
    );
    checkDimensions(width, height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器不支持图片画布，请更新浏览器后重试');
    if (settings.format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    bitmap.close();
    canvas.width = 1;
    canvas.height = 1;
    let output: Uint8Array;
    try {
      output = await encodePixels(pixels, settings);
    } catch (error) {
      if (error instanceof Error && /[\u3400-\u9fff]/u.test(error.message))
        throw error;
      throw new Error('编码失败，请重试；首次使用此格式需要加载编码器');
    }
    // Copy out of a codec-owned view before the worker and WASM memory are released.
    const bytes = new Uint8Array(output.length);
    bytes.set(output);
    return {
      blob: new Blob([bytes.buffer], { type: FORMAT_MIME[settings.format] }),
      width,
      height,
      duration: Math.round(performance.now() - started),
    };
  } finally {
    bitmap.close();
  }
}

workerScope.onmessage = async (event) => {
  try {
    workerScope.postMessage({ ok: true, result: await handle(event.data) });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      message:
        error instanceof Error && /[\u3400-\u9fff]/u.test(error.message)
          ? error.message
          : '图片处理失败，请检查文件后重试',
    });
  }
};
