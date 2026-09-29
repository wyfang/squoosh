import { useEffect, useRef, useState } from 'react';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { Check, Copy } from 'lucide-react';
import { copyImageToClipboard } from './clipboard';

export default function CopyImageButton({
  blob,
  onError,
}: {
  blob?: Blob;
  onError: (message: string) => void;
}) {
  const [copying, setCopying] = useState(false);
  const [copiedBlob, setCopiedBlob] = useState<Blob | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = async () => {
    if (!blob || busy.current) return;
    const result = blob;
    busy.current = true;
    setCopying(true);
    setCopiedBlob(null);
    onError('');
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    try {
      await copyImageToClipboard(result);
      if (!mounted.current) return;
      setCopiedBlob(result);
      resetTimer.current = setTimeout(() => setCopiedBlob(null), 2000);
    } catch (error) {
      if (mounted.current)
        onError(error instanceof Error ? error.message : '复制失败，请重试');
    } finally {
      busy.current = false;
      if (mounted.current) setCopying(false);
    }
  };
  const copied = !!blob && copiedBlob === blob;
  return (
    <Tooltip delay={400}>
      <Button
        fullWidth
        variant="secondary"
        className="copy-image"
        aria-label={copied ? '图片已复制' : '复制图片到剪贴板'}
        isDisabled={!blob || copying}
        onPress={() => void copy()}
      >
        {copying ? (
          <Spinner size="sm" />
        ) : copied ? (
          <Check size={15} />
        ) : (
          <Copy size={15} />
        )}
        {copying ? '复制中' : copied ? '已复制' : '复制图片'}
      </Button>
      <Tooltip.Content>复制当前 PNG 结果</Tooltip.Content>
    </Tooltip>
  );
}
