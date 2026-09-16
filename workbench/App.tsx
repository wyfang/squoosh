import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Label, Slider, Spinner, Switch, Tooltip } from '@heroui/react';
import {
  ArrowDownToLine,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Columns2,
  FileImage,
  ImagePlus,
  Layers2,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkbench, type WorkbenchItem as ImageItem } from './useWorkbench';
import ImageViewport, {
  type ViewportControls,
  type ViewMode,
} from './ImageViewport';
import ZoomToolbar from './ZoomToolbar';
import SettingNumberInput from './SettingNumberInput';
import ThemeToggle from './ThemeToggle';
import SizeRatio from './SizeRatio';
import {
  type EncodeSettings as Settings,
  type OutputFormat as Format,
} from './types';
const sampleUrl = `${import.meta.env.BASE_URL}sample.jpg`;

const formats: { id: Format; label: string; detail: string }[] = [
  { id: 'webp', label: 'WebP', detail: '日常通用' },
  { id: 'avif', label: 'AVIF', detail: '更小体积' },
  { id: 'jpeg', label: 'JPEG', detail: '广泛兼容' },
  { id: 'png', label: 'PNG', detail: '无损透明' },
];
const formatName = (v: Format) => formats.find((f) => f.id === v)?.label || v;
function size(n?: number) {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  return n < 1048576
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / 1048576).toFixed(2)} MB`;
}
function reduction(a: number, b: number) {
  return Math.round((1 - b / a) * 100);
}
function IconButton({
  label,
  children,
  onPress,
  disabled = false,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        size="sm"
        variant={active ? 'secondary' : 'ghost'}
        aria-label={label}
        isDisabled={disabled}
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

export default function App() {
  const wb = useWorkbench();
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ViewMode>('compare');
  const [viewport, setViewport] = useState<ViewportControls | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'files' | 'settings' | null>(
    null,
  );
  const dragDepth = useRef(0);
  const selected = wb.active;
  const settings = selected?.settings || wb.defaults;
  const ready = wb.items.filter((i) => i.status === 'ready');
  const busy =
    wb.importing ||
    wb.items.some((i) => i.status === 'queued' || i.status === 'encoding');

  const originalTotal = wb.items.reduce(
    (total, item) => total + item.file.size,
    0,
  );
  const currentTotal = wb.items.reduce(
    (total, item) =>
      total +
      (item.status === 'ready' && item.output
        ? item.output.blob.size
        : item.file.size),
    0,
  );
  const unresolved = wb.items.filter(
    (item) => item.status !== 'ready' || !item.output,
  );
  const pendingBytes = unresolved.reduce(
    (total, item) => total + item.file.size,
    0,
  );
  const saved = originalTotal - currentTotal;
  const update = (patch: Partial<Settings>) => wb.updateSettings(patch);
  const pick = useCallback(() => input.current?.click(), []);
  const add = useCallback(
    (files: File[]) => {
      setMobilePanel(null);
      return wb.addFiles(files);
    },
    [wb.addFiles],
  );
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        pick();
      }
    };
    window.addEventListener('paste', paste);
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('paste', paste);
      window.removeEventListener('keydown', keys);
    };
  }, [add, pick]);

  useEffect(() => {
    const changeView = (event: KeyboardEvent) => {
      if (
        !selected?.url ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="spinbutton"], [role="combobox"]',
          ))
      )
        return;
      const views: Record<string, ViewMode> = {
        Digit1: 'original',
        Digit2: 'compare',
        Digit3: 'output',
        Numpad1: 'original',
        Numpad2: 'compare',
        Numpad3: 'output',
      };
      const next = views[event.code];
      if (event.code.startsWith('Numpad') && event.key !== event.code.slice(-1))
        return;
      if (!next || (next !== 'original' && !selected.output?.url)) return;
      event.preventDefault();
      setView(next);
    };
    window.addEventListener('keydown', changeView, true);
    return () => window.removeEventListener('keydown', changeView, true);
  }, [selected?.url, selected?.output?.url]);

  const downloadAll = async () => {
    if (!ready.length || exporting) return;
    setExporting(true);
    try {
      if (ready.length === 1) {
        saveBlob(ready[0].output!.blob, outputName(ready[0]));
        return;
      }
      const { zip } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      for (const item of ready) {
        let name = outputName(item);
        let count = 2;
        while (files[name])
          name = outputName(item).replace(/(\.[^.]+)$/, ` (${count++})$1`);
        files[name] = new Uint8Array(await item.output!.blob.arrayBuffer());
      }
      const data = await new Promise<Uint8Array>((resolve, reject) =>
        zip(files, { level: 0 }, (error, result) =>
          error ? reject(error) : resolve(result),
        ),
      );
      saveBlob(
        new Blob([data as BlobPart], { type: 'application/zip' }),
        'squoosh-images.zip',
      );
    } catch {
      setLocalError('导出失败，请重试。');
    } finally {
      setExporting(false);
    }
  };
  const loadSample = async () => {
    setSampleBusy(true);
    setLocalError('');
    try {
      const response = await fetch(sampleUrl);
      if (!response.ok) throw Error();
      await add([
        new File([await response.blob()], 'red-panda.jpg', {
          type: 'image/jpeg',
        }),
      ]);
    } catch {
      setLocalError('示例加载失败，请重新尝试。');
    } finally {
      setSampleBusy(false);
    }
  };
  const download = () => {
    if (selected?.status === 'ready')
      saveBlob(selected.output!.blob, outputName(selected));
  };
  const preset =
    settings.quality === 50
      ? 'small'
      : settings.quality === 90
        ? 'high'
        : settings.quality === 75
          ? 'balanced'
          : '';
  const qualityDisabled = settings.format === 'png' || settings.lossless;
  return (
    <div
      className="app-shell"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        add(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
        className="file-input"
        onChange={(e) => {
          add(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <main className="workbench">
        <aside
          className={`file-sidebar ${mobilePanel === 'files' ? 'mobile-open' : ''}`}
          aria-label="图片列表"
        >
          <div className="file-brandbar">
            <CompactBrand onFit={() => viewport?.fit()} />
          </div>
          <div className="panel-heading">
            <span>
              文件 <b>{wb.items.length.toString().padStart(2, '0')}</b>
            </span>
            <div>
              {wb.items.length > 0 && (
                <IconButton label="清空列表" onPress={wb.clear}>
                  <Trash2 size={14} />
                </IconButton>
              )}
              <span className="mobile-close">
                <IconButton
                  label="关闭文件列表"
                  onPress={() => setMobilePanel(null)}
                >
                  <X size={16} />
                </IconButton>
              </span>
            </div>
          </div>
          <div className="file-list">
            {!wb.items.length ? (
              <div className="file-list-empty">
                <span className="empty-file-icon">
                  <FilesIcon />
                </span>
                <p>还没有图片</p>
                <span>添加后在这里切换</span>
              </div>
            ) : (
              wb.items.map((item) => (
                <div
                  className={`file-row ${selected?.id === item.id ? 'selected' : ''}`}
                  key={item.id}
                >
                  <button
                    className="file-select"
                    onClick={() => {
                      wb.setActiveId(item.id);
                      setMobilePanel(null);
                    }}
                    aria-pressed={selected?.id === item.id}
                    aria-label={`选择 ${item.file.name}`}
                  >
                    {item.url ? (
                      <img src={item.url} alt="" />
                    ) : (
                      <FileImage size={28} />
                    )}
                    <span className="file-copy">
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>
                        {item.width} × {item.height}
                      </span>
                      <SizeRatio
                        original={item.file.size}
                        current={
                          item.status === 'ready'
                            ? item.output?.blob.size
                            : undefined
                        }
                        status={item.status}
                      />
                    </span>
                    <span className="file-state">
                      {item.status === 'ready' ? (
                        <Check size={13} />
                      ) : item.status === 'error' ? (
                        <CircleAlert size={13} />
                      ) : (
                        <Spinner size="sm" />
                      )}
                    </span>
                  </button>
                  <button
                    className="remove-file"
                    aria-label={`移除 ${item.file.name}`}
                    onClick={() => wb.remove(item.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
            <Button
              className={`add-file-button ${!wb.items.length ? 'empty-queue-add' : ''}`}
              variant="ghost"
              onPress={pick}
            >
              <Plus size={16} />
              添加图片<kbd>⌘ O</kbd>
            </Button>
          </div>
          <div className="sidebar-bottom">
            <div>
              <span>已完成</span>
              <strong>
                {ready.length}
                <em> / {wb.items.length}</em>
              </strong>
            </div>
            <div>
              <span>{saved < 0 ? '体积增加' : '累计节省'}</span>
              <strong className={saved < 0 ? 'warning-text' : 'savings-text'}>
                {size(Math.abs(saved))}
              </strong>
            </div>
            {wb.items.length > 0 && (
              <div className="total-size-comparison">
                <span className="total-size-heading">
                  <span>
                    {unresolved.length || wb.importing ? '当前合计' : '总体积'}
                  </span>
                  <span>
                    原图 →{' '}
                    {unresolved.length || wb.importing ? '当前' : '转换后'}
                  </span>
                </span>
                <SizeRatio
                  original={originalTotal}
                  current={currentTotal}
                  pendingBytes={pendingBytes}
                  summary
                />
                {(unresolved.length > 0 || wb.importing) && (
                  <span className="total-size-note">
                    {wb.importing ? '导入中 · ' : ''}
                    {unresolved.length > 0
                      ? `${unresolved.length} 张未完成，按原图计`
                      : '正在读取更多图片'}
                  </span>
                )}
              </div>
            )}
          </div>
        </aside>
        <section className="workspace-center" aria-label="图片预览">
          <div className="preview-toolbar">
            <div className="mobile-workspace-identity">
              <CompactBrand onFit={() => viewport?.fit()} />
              <ThemeToggle />
            </div>
            <div
              className="view-segments"
              role="group"
              aria-label="预览模式"
              aria-keyshortcuts="1 2 3"
            >
              {[
                { id: 'original', label: '原图', icon: FileImage },
                { id: 'compare', label: '对比', icon: Columns2 },
                { id: 'output', label: '结果', icon: ImagePlus },
              ].map((v, index) => (
                <Tooltip key={v.id} delay={400}>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-pressed={view === v.id}
                    isDisabled={
                      !selected || (v.id !== 'original' && !selected.output?.url)
                    }
                    onPress={() => setView(v.id as ViewMode)}
                  >
                    <v.icon size={14} />
                    {v.label}
                  </Button>
                  <Tooltip.Content>
                    {v.label} ({index + 1})
                  </Tooltip.Content>
                </Tooltip>
              ))}
            </div>
            <ZoomToolbar controls={viewport} disabled={!selected?.url} />
          </div>
          <div className={`canvas ${selected ? 'has-image' : ''}`}>
            {selected ? (
              <>
                {selected.url ? (
                  <ImageViewport
                    key={selected.id}
                    item={selected}
                    view={view}
                    onControls={setViewport}
                    initialCamera={viewport?.getCamera()}
                  />
                ) : (
                  <div className="invalid-preview">
                    <FileImage size={36} />
                    <span>无法预览此图片</span>
                  </div>
                )}
                {selected.status === 'encoding' ||
                selected.status === 'queued' ? (
                  <div className="encoding-pill" role="status">
                    <Spinner size="sm" />
                    正在转换
                  </div>
                ) : selected.status === 'error' ? (
                  <div className="canvas-error" role="alert">
                    <CircleAlert size={18} />
                    <span>{selected.error || '转换失败'}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => wb.retry(selected.id)}
                    >
                      重试
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-workspace">
                <div className="upload-target">
                  <div className="upload-art">
                    <div className="art-sheet back">
                      <FileImage size={26} />
                    </div>
                    <div className="art-sheet front">
                      <ImagePlus size={30} strokeWidth={1.5} />
                    </div>
                    <span className="art-plus">
                      <Plus size={15} />
                    </span>
                  </div>
                  <h1>把图片放进来</h1>
                  <p>拖放图片，或直接粘贴</p>
                  <Button onPress={pick} className="choose-files">
                    <Plus size={16} />
                    选择图片
                  </Button>
                  <span className="upload-support">
                    JPG · PNG · WebP · AVIF · BMP
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={loadSample}
                  isDisabled={sampleBusy}
                  className="sample-button"
                >
                  用一张示例图片试试
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
          {selected && (
            <div className="preview-status">
              <span>
                <span className="status-dot" />
                {selected.file.name}
              </span>
              <span>
                {selected.width} × {selected.height} px
              </span>
            </div>
          )}
        </section>
        <aside
          className={`inspector ${mobilePanel === 'settings' ? 'mobile-open' : ''}`}
          aria-label="导出设置"
        >
          <div className="panel-heading">
            <span>导出设置</span>
            <div>
              <span className="desktop-theme-toggle">
                <ThemeToggle />
              </span>
              <IconButton
                label="重置设置"
                onPress={() =>
                  update({
                    format: 'webp',
                    quality: 75,
                    scale: 100,
                    lossless: false,
                  })
                }
              >
                <RotateCcw size={14} />
              </IconButton>
              <span className="mobile-close">
                <IconButton
                  label="关闭导出设置"
                  onPress={() => setMobilePanel(null)}
                >
                  <X size={16} />
                </IconButton>
              </span>
            </div>
          </div>
          <div className="inspector-scroll">
            <section className="control-section">
              <div className="section-label">
                格式
                <span>
                  {settings.format === 'png'
                    ? 'OxiPNG'
                    : settings.format === 'jpeg'
                      ? 'MozJPEG'
                      : settings.format === 'avif'
                        ? 'AV1'
                        : 'WebP'}
                </span>
              </div>
              <div className="format-grid" role="group" aria-label="输出格式">
                {formats.map((f) => (
                  <Button
                    key={f.id}
                    variant="ghost"
                    className={`format-option ${settings.format === f.id ? 'is-selected' : ''}`}
                    aria-pressed={settings.format === f.id}
                    onPress={() => update({ format: f.id })}
                  >
                    <span>
                      <span className="format-option-heading">
                        <strong>{f.label}</strong>
                        {settings.format === f.id && (
                          <span className="format-check" aria-hidden="true">
                            <Check size={11} strokeWidth={2.5} />
                          </span>
                        )}
                      </span>
                      <small>{f.detail}</small>
                    </span>
                  </Button>
                ))}
              </div>
            </section>
            <section className="control-section quality-section">
              <div className="section-label">
                压缩质量
                {qualityDisabled ? (
                  <span>无损</span>
                ) : (
                  <SettingNumberInput
                    key={selected?.id ?? 'default'}
                    label="压缩质量数值"
                    value={settings.quality}
                    onChange={(quality) => update({ quality })}
                  />
                )}
              </div>
              <Slider
                className="settings-slider"
                aria-label="压缩质量"
                minValue={1}
                maxValue={100}
                value={settings.quality}
                isDisabled={qualityDisabled}
                onChange={(v) => update({ quality: Number(v) })}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <div className="range-labels">
                <span>更小体积</span>
                <span>更高画质</span>
              </div>
              <div className="presets" role="group" aria-label="压缩预设">
                {[
                  { id: 'small', label: '小体积', q: 50 },
                  { id: 'balanced', label: '均衡', q: 75 },
                  { id: 'high', label: '高画质', q: 90 },
                ].map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant="ghost"
                    isDisabled={qualityDisabled}
                    aria-pressed={preset === p.id}
                    onPress={() => update({ quality: p.q })}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {(settings.format === 'webp' || settings.format === 'avif') && (
                <Switch
                  className="lossless-toggle"
                  size="sm"
                  isSelected={settings.lossless}
                  onChange={(v) => update({ lossless: v })}
                >
                  <Switch.Content>
                    <Label>无损压缩</Label>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              )}
            </section>
            <section className="control-section resize-section">
              <div className="section-label">
                调整尺寸
                <SettingNumberInput
                  key={selected?.id ?? 'default'}
                  label="输出尺寸比例"
                  value={settings.scale}
                  onChange={(scale) => update({ scale })}
                  unit="%"
                />
              </div>
              <Slider
                className="settings-slider"
                aria-label="输出尺寸比例"
                minValue={1}
                maxValue={100}
                step={1}
                value={settings.scale}
                onChange={(value) => update({ scale: Number(value) })}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <div
                className="presets resize-presets"
                role="group"
                aria-label="尺寸预设"
              >
                {[25, 50, 75, 100].map((scale) => (
                  <Button
                    key={scale}
                    size="sm"
                    variant="ghost"
                    aria-label={
                      scale === 100 ? '恢复原始尺寸 100%' : `输出尺寸 ${scale}%`
                    }
                    aria-pressed={settings.scale === scale}
                    onPress={() => update({ scale })}
                  >
                    {scale}%
                  </Button>
                ))}
              </div>
              <div className="dimension-preview">
                <span>输出尺寸</span>
                <output aria-label="输出像素尺寸">
                  {selected ? (
                    <>
                      {Math.max(
                        1,
                        Math.round((selected.width * settings.scale) / 100),
                      )}
                      <span className="dimension-separator">×</span>
                      {Math.max(
                        1,
                        Math.round((selected.height * settings.scale) / 100),
                      )}
                      <span className="dimension-unit">px</span>
                    </>
                  ) : (
                    '—'
                  )}
                </output>
              </div>
            </section>
            <section className="control-section batch-section">
              <Button
                fullWidth
                size="sm"
                variant="outline"
                isDisabled={wb.items.length < 2}
                onPress={wb.applyToAll}
              >
                <CheckCheck size={15} />
                将设置应用到全部
              </Button>
              {settings.format === 'jpeg' && (
                <p className="relevant-note">透明区域将填充白色</p>
              )}
            </section>
          </div>
          <div className="export-card">
            <div className="export-summary">
              <span>输出大小</span>
              <strong>
                {selected?.status === 'ready'
                  ? size(selected.output?.blob.size)
                  : selected?.status === 'encoding' ||
                      selected?.status === 'queued'
                    ? '更新中'
                    : '—'}
              </strong>
            </div>
            <div className="export-detail">
              {selected?.status === 'ready' && selected.output ? (
                <>
                  <span>
                    {formatName(settings.format)}
                    <span className="dot-separator">·</span>
                    {Math.max(
                      1,
                      Math.round((selected.width * settings.scale) / 100),
                    )}{' '}
                    ×{' '}
                    {Math.max(
                      1,
                      Math.round((selected.height * settings.scale) / 100),
                    )}
                  </span>
                  <b
                    className={
                      selected.output.blob.size > selected.file.size
                        ? 'warning-text'
                        : 'savings-text'
                    }
                  >
                    {selected.output.blob.size > selected.file.size
                      ? '增加'
                      : '减少'}{' '}
                    {Math.abs(
                      reduction(selected.file.size, selected.output.blob.size),
                    )}
                    %
                  </b>
                </>
              ) : (
                <span>
                  {selected ? '按最新参数更新结果' : '添加图片后自动转换'}
                </span>
              )}
            </div>
            <div className="export-actions">
              <Button
                fullWidth
                className="single-download"
                onPress={download}
                isDisabled={selected?.status !== 'ready'}
              >
                <ArrowDownToLine size={16} />
                导出当前图片
              </Button>
              {wb.items.length > 1 && (
                <Button
                  fullWidth
                  variant="outline"
                  className="batch-download"
                  isDisabled={!ready.length || exporting}
                  onPress={() => void downloadAll()}
                >
                  {exporting ? <Spinner size="sm" /> : <Layers2 size={15} />}
                  {exporting
                    ? '正在打包'
                    : busy || ready.length < wb.items.length
                      ? `导出已完成 · ${ready.length}`
                      : `导出全部 · ${ready.length}`}
                </Button>
              )}
            </div>
          </div>
        </aside>
      </main>
      <footer className="app-footer">
        <div>
          <ShieldCheck size={13} />
          <span>设备本地处理</span>
          <i />
          <span>Squoosh 编码引擎</span>
        </div>
        <div>
          <a
            href="https://github.com/wyfang/squoosh"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库：wyfang/squoosh"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
            </svg>
            GitHub
          </a>
        </div>
      </footer>
      <div className="mobile-bottom">
        <Button
          variant="secondary"
          size="sm"
          onPress={() => setMobilePanel('files')}
        >
          <Layers2 size={16} />
          文件 {wb.items.length}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => setMobilePanel('settings')}
        >
          <Settings2 size={16} />
          设置
        </Button>
        <Button
          size="sm"
          onPress={() => setMobilePanel('settings')}
          isDisabled={!selected}
        >
          <ArrowDownToLine size={16} />
          导出
        </Button>
      </div>
      {mobilePanel && (
        <button
          className="mobile-backdrop"
          aria-label="关闭面板"
          onClick={() => setMobilePanel(null)}
        />
      )}
      {dragging && (
        <div className="drop-overlay">
          <ImagePlus size={42} />
          <strong>松开，添加图片</strong>
        </div>
      )}
      {(wb.error || localError) && (
        <div className="error-toast" role="alert">
          <CircleAlert size={18} />
          <span>{wb.error || localError}</span>
          <IconButton
            label="关闭错误提示"
            onPress={() => {
              wb.setError('');
              setLocalError('');
            }}
          >
            <X size={15} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
function FilesIcon() {
  return <Layers2 size={23} strokeWidth={1.3} />;
}
function CompactBrand({ onFit }: { onFit: () => void }) {
  return (
    <a
      className="compact-brand"
      href={import.meta.env.BASE_URL}
      aria-label="Squoosh 图片工作台"
      onClick={(event) => {
        event.preventDefault();
        onFit();
      }}
    >
      <span className="compact-brand-mark" aria-hidden="true">
        <svg viewBox="4 4 24 24" fill="currentColor" focusable="false">
          <path d="M25 6H12a6 6 0 0 0 0 12h8a2 2 0 0 1 0 4H9l-2 4h13a6 6 0 0 0 0-12h-8a2 2 0 0 1 0-4h11z" />
        </svg>
      </span>
      <span className="compact-brand-copy">
        <strong>
          squoosh<span>.</span>
        </strong>
        <span>图片工作台</span>
      </span>
    </a>
  );
}
function outputName(item: ImageItem) {
  const base =
    item.file.name
      .replace(/\.[^.]*$/, '')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'image';
  return `${base}.${item.settings.format === 'jpeg' ? 'jpg' : item.settings.format}`;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
