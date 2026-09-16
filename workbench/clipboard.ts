const unsupported = '当前浏览器不支持复制图片，请下载图片。';

function copyError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return new Error('复制被浏览器阻止，请允许剪贴板访问后重试。');
    if (error.name === 'NotSupportedError') return new Error(unsupported);
  }
  return new Error('复制图片失败，请重试。');
}

/** Call directly from the press handler, before any await, to retain Safari activation. */
export function copyImageToClipboard(blob: Blob): Promise<void> {
  if (blob.type !== 'image/png')
    return Promise.reject(new Error('仅支持复制 PNG 图片，请下载当前格式。'));
  if (!blob.size)
    return Promise.reject(new Error('图片数据为空，请重新转换后重试。'));
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.clipboard?.write !== 'function' ||
    typeof ClipboardItem === 'undefined'
  )
    return Promise.reject(new Error(unsupported));

  try {
    if (
      typeof ClipboardItem.supports === 'function' &&
      !ClipboardItem.supports('image/png')
    )
      return Promise.reject(new Error(unsupported));
    const item = new ClipboardItem({ 'image/png': blob });
    // No await before write: WebKit requires this call in the original user gesture.
    return navigator.clipboard.write([item]).catch((error: unknown) => {
      throw copyError(error);
    });
  } catch (error) {
    return Promise.reject(copyError(error));
  }
}
