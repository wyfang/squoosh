import {
  MAX_FILE_BYTES,
  type CodecRequest,
  type CodecResponse,
  type EncodeResult,
  type EncodeSettings,
  type ImageDimensions,
} from './types';

export * from './types';

function abortError() {
  return new DOMException('已取消转换', 'AbortError');
}

/** Each operation owns its worker, so cancellation releases WASM CPU and memory. */
function runWorker<T extends ImageDimensions>(
  request: CodecRequest,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!request.file.size) return Promise.reject(new Error('图片文件为空'));
  if (request.file.size > MAX_FILE_BYTES) {
    return Promise.reject(new Error('单张图片不能超过 40 MB'));
  }

  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./codec.worker.ts', import.meta.url), {
        type: 'module',
        name: `squoosh-${request.kind}`,
      });
    } catch {
      reject(new Error('无法启动图片处理线程，请使用较新版本的浏览器'));
      return;
    }

    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(abortError());
    const timeout = setTimeout(
      () => fail(new Error('处理超时，请缩小图片尺寸后重试')),
      request.kind === 'read' ? 30_000 : 120_000,
    );

    worker.onmessage = (event: MessageEvent<CodecResponse>) => {
      if (settled) return;
      if (!event.data.ok) {
        fail(new Error(event.data.message));
        return;
      }
      settled = true;
      cleanup();
      resolve(event.data.result as T);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(new Error('图片处理线程异常，请重试或换一张图片'));
    };
    worker.onmessageerror = () => fail(new Error('无法读取图片处理结果'));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      worker.postMessage(request);
    } catch {
      fail(new Error('无法将图片发送到处理线程'));
    }
  });
}

export function encodeImage(
  file: File,
  settings: EncodeSettings,
  signal?: AbortSignal,
): Promise<EncodeResult> {
  return runWorker<EncodeResult>({ kind: 'encode', file, settings }, signal);
}

/** Validates the file and dimensions without retaining a decoded bitmap. */
export function readImage(
  file: File,
  signal?: AbortSignal,
): Promise<ImageDimensions> {
  return runWorker<ImageDimensions>({ kind: 'read', file }, signal);
}
