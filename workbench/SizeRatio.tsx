import { ChevronRight } from 'lucide-react';
import './size-ratio.css';

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  return value < 1048576
    ? `${(value / 1024).toFixed(1)} KB`
    : `${(value / 1048576).toFixed(2)} MB`;
}

function percentage(value: number) {
  if (value > 0 && value < 0.1) return '<0.1%';
  return `${Number(value.toFixed(1))}%`;
}

export default function SizeRatio({
  original,
  current,
  status = 'ready',
  pendingBytes = 0,
  summary = false,
}: {
  original: number;
  current?: number;
  status?: 'queued' | 'encoding' | 'ready' | 'error';
  pendingBytes?: number;
  summary?: boolean;
}) {
  const available = status === 'ready' && current !== undefined;
  const ratio = available && original > 0 ? (current / original) * 100 : null;
  const larger = available && current > original;
  const scale = Math.max(original, current ?? 0, 1);
  const width = available ? ((current ?? 0) / scale) * 100 : 0;
  const originalWidth = (original / scale) * 100;
  const pendingWidth = available
    ? (Math.max(0, Math.min(pendingBytes, current ?? 0)) / scale) * 100
    : 0;
  const result = available
    ? bytes(current)
    : status === 'error'
      ? '失败'
      : status === 'queued'
        ? '等待中'
        : '处理中';
  const label = ratio === null ? '—' : percentage(ratio);
  const caption = larger && ratio !== null
    ? `${Number((ratio / 100).toFixed(2))} 倍`
    : label;
  const description = available
    ? `原图 ${bytes(original)}，${summary ? '当前合计' : '转换后'} ${result}，原图的 ${label}${larger ? '，体积增加' : ''}`
    : `原图 ${bytes(original)}，${result}`;

  return (
    <span
      className={`size-ratio ${summary ? 'size-ratio--summary' : ''} ${larger ? 'size-ratio--larger' : ''}`}
      title={description}
    >
      <span
        className="size-ratio-track"
        role={ratio === null ? undefined : 'meter'}
        aria-label={
          ratio === null
            ? description
            : summary
              ? '全部图片体积占比'
              : '图片体积占比'
        }
        aria-valuemin={ratio === null ? undefined : 0}
        aria-valuemax={ratio === null ? undefined : Math.max(100, ratio)}
        aria-valuenow={ratio ?? undefined}
        aria-valuetext={ratio === null ? undefined : description}
      >
        {width > 0 && !larger && (
          <span
            className="size-ratio-fill"
            style={{ width: `${width}%` }}
            aria-hidden="true"
          />
        )}
        {larger && (
          <span
            className="size-ratio-growth"
            style={{ left: `${originalWidth}%`, width: `${100 - originalWidth}%` }}
            aria-hidden="true"
          />
        )}
        {pendingWidth > 0 && (
          <span
            className="size-ratio-pending"
            style={{
              width: `${pendingWidth}%`,
              left: `${width - pendingWidth}%`,
            }}
            aria-hidden="true"
          />
        )}
        <span className="size-ratio-values">
          <span>{bytes(original)}</span>
          <ChevronRight size={10} aria-hidden="true" />
          <b className={status === 'error' ? 'error-text' : undefined}>
            {result}
          </b>
        </span>
      </span>
      <span className="size-ratio-caption">
        <span>{larger ? '原图的' : original > 0 ? '原图 100%' : '原图'}</span>
        <b>{available ? caption : '—'}</b>
      </span>
    </span>
  );
}
