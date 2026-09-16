import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeImage, readImage } from './engine';
import { MAX_FILE_BYTES, MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS } from './types';
import type { EncodeSettings } from './types';

export interface WorkbenchItem {
  id: string;
  file: File;
  name: string;
  url: string;
  width: number;
  height: number;
  settings: EncodeSettings;
  status: 'queued' | 'encoding' | 'ready' | 'error';
  revision: number;
  /** Last successful preview; only downloadable when status is ready. */
  output?: {
    blob: Blob;
    url: string;
    width: number;
    height: number;
    duration: number;
  };
  error?: string;
}

const INITIAL_SETTINGS: EncodeSettings = {
  format: 'webp',
  quality: 75,
  scale: 100,
  lossless: false,
};
const MAX_ITEMS = 30;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DEBOUNCE_MS = 180;

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '无法处理这张图片，请重试。';
}

function sameSettings(a: EncodeSettings, b: EncodeSettings) {
  return (
    a.format === b.format &&
    a.quality === b.quality &&
    a.scale === b.scale &&
    a.lossless === b.lossless
  );
}

function mergeSettings(
  current: EncodeSettings,
  patch: Partial<EncodeSettings>,
): EncodeSettings {
  const settings = { ...current, ...patch };
  settings.quality = Number.isFinite(settings.quality)
    ? Math.min(100, Math.max(0, Math.round(settings.quality)))
    : current.quality;
  settings.scale = Number.isFinite(settings.scale)
    ? Math.min(100, Math.max(1, Math.round(settings.scale)))
    : current.scale;
  if (settings.format === 'jpeg') settings.lossless = false;
  return settings;
}

function release(item: WorkbenchItem) {
  if (item.url) URL.revokeObjectURL(item.url);
  if (item.output) URL.revokeObjectURL(item.output.url);
}

export function useWorkbench() {
  const [items, setItems] = useState<WorkbenchItem[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<EncodeSettings>({
    ...INITIAL_SETTINGS,
  });
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const itemsRef = useRef(items);
  const activeIdRef = useRef(activeId);
  const defaultsRef = useRef(defaults);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dueAt = useRef(0);
  const generation = useRef(0);
  const selectionIntent = useRef(0);
  const imports = useRef(new Set<symbol>());
  const importControllers = useRef(new Set<AbortController>());
  const importChain = useRef<Promise<void>>(Promise.resolve());
  const running = useRef<{
    id: string;
    revision: number;
    controller: AbortController;
  } | null>(null);
  const wake = useRef<() => void>(() => undefined);
  const start = useRef<() => void>(() => undefined);

  // The ref is authoritative between React renders and async completions.
  const commit = useCallback(
    (update: (current: WorkbenchItem[]) => WorkbenchItem[]) => {
      if (!mounted.current) return;
      itemsRef.current = update(itemsRef.current);
      setItems(itemsRef.current);
    },
    [],
  );

  const schedule = useCallback(() => {
    dueAt.current = Date.now() + DEBOUNCE_MS;
    wake.current();
  }, []);

  wake.current = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (
      !mounted.current ||
      running.current ||
      !itemsRef.current.some((item) => item.status === 'queued')
    )
      return;
    timer.current = setTimeout(
      () => {
        timer.current = null;
        start.current();
      },
      Math.max(0, dueAt.current - Date.now()),
    );
  };

  start.current = () => {
    if (!mounted.current || running.current) return;
    const next =
      itemsRef.current.find(
        (item) => item.id === activeIdRef.current && item.status === 'queued',
      ) ?? itemsRef.current.find((item) => item.status === 'queued');
    if (!next) return;
    const job = {
      id: next.id,
      revision: next.revision,
      controller: new AbortController(),
    };
    running.current = job;
    commit((current) =>
      current.map((item) =>
        item.id === next.id
          ? { ...item, status: 'encoding', error: undefined }
          : item,
      ),
    );
    void encodeImage(next.file, { ...next.settings }, job.controller.signal)
      .then((result) => {
        if (!mounted.current || job.controller.signal.aborted) return;
        const current = itemsRef.current.find((item) => item.id === job.id);
        if (!current || current.revision !== job.revision) return;
        const url = URL.createObjectURL(result.blob);
        if (current.output) URL.revokeObjectURL(current.output.url);
        commit((list) =>
          list.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: 'ready',
                  output: { ...result, url },
                  error: undefined,
                }
              : item,
          ),
        );
      })
      .catch((reason: unknown) => {
        if (!mounted.current || job.controller.signal.aborted) return;
        commit((current) =>
          current.map((item) =>
            item.id === job.id && item.revision === job.revision
              ? { ...item, status: 'error', error: messageOf(reason) }
              : item,
          ),
        );
      })
      .finally(() => {
        if (running.current === job) running.current = null;
        wake.current();
      });
  };

  const selectItem = useCallback(
    (id: string | null) => {
      const selected = itemsRef.current.find((item) => item.id === id);
      if (id !== null && !selected) return false;
      activeIdRef.current = id;
      setActiveIdState(id);
      const job = running.current;
      if (job && job.id !== id && selected?.status === 'queued') {
        job.controller.abort();
        commit((current) =>
          current.map((item) =>
            item.id === job.id && item.revision === job.revision
              ? { ...item, status: 'queued' }
              : item,
          ),
        );
      }
      schedule();
      return true;
    },
    [commit, schedule],
  );

  const setActiveId = useCallback(
    (id: string | null) => {
      // Even selecting the current image is a new intent that pending imports must respect.
      if (selectItem(id)) selectionIntent.current += 1;
    },
    [selectItem],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length || !mounted.current) return Promise.resolve();
      const selection = [...files];
      const settings = { ...defaultsRef.current };
      const epoch = generation.current;
      const intent = ++selectionIntent.current;
      const token = Symbol('import');
      imports.current.add(token);
      setImporting(true);
      setError(null);
      const task = importChain.current
        .catch(() => undefined)
        .then(async () => {
          const rejected: string[] = [];
          const failedIds: string[] = [];
          let foundValidImage = false;
          for (const file of selection) {
            if (!mounted.current || generation.current !== epoch) break;
            if (itemsRef.current.length >= MAX_ITEMS) {
              rejected.push('最多添加 30 张图片');
              break;
            }
            if (file.size > MAX_FILE_BYTES) {
              rejected.push(
                `${file.name} 超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`,
              );
              continue;
            }
            if (
              itemsRef.current.reduce(
                (total, item) => total + item.file.size,
                0,
              ) +
                file.size >
              MAX_TOTAL_BYTES
            ) {
              rejected.push('图片总大小不能超过 100 MB');
              continue;
            }
            const controller = new AbortController();
            importControllers.current.add(controller);
            let width = 0;
            let height = 0;
            let failure: string | undefined;
            try {
              const size = await readImage(file, controller.signal);
              width = size.width;
              height = size.height;
              if (!width || !height) throw new Error('图片尺寸无效');
              if (width * height > MAX_IMAGE_PIXELS)
                throw new Error('图片不能超过 1 亿像素');
              if (Math.max(width, height) > MAX_IMAGE_EDGE)
                throw new Error(`图片边长不能超过 ${MAX_IMAGE_EDGE} 像素`);
            } catch (reason) {
              failure = messageOf(reason);
            } finally {
              importControllers.current.delete(controller);
            }
            if (
              !mounted.current ||
              generation.current !== epoch ||
              controller.signal.aborted
            ) {
              break;
            }
            // Expose a preview only after worker-side format, animation and size validation.
            const url = failure ? '' : URL.createObjectURL(file);
            const item: WorkbenchItem = {
              id: crypto.randomUUID(),
              file,
              name: file.name,
              url,
              width,
              height,
              settings: { ...settings },
              status: failure ? 'error' : 'queued',
              revision: 0,
              error: failure,
            };
            commit((current) => [...current, item]);
            if (failure) {
              failedIds.push(item.id);
            } else if (!foundValidImage) {
              foundValidImage = true;
              // Select once per batch, unless newer user activity has taken ownership.
              if (selectionIntent.current === intent) selectItem(item.id);
            }
            schedule();
          }
          if (
            !foundValidImage &&
            mounted.current &&
            generation.current === epoch &&
            selectionIntent.current === intent
          ) {
            const failedId = failedIds.find((id) =>
              itemsRef.current.some((item) => item.id === id),
            );
            if (failedId) selectItem(failedId);
          }
          if (
            rejected.length &&
            mounted.current &&
            generation.current === epoch
          ) {
            setError([...new Set(rejected)].slice(0, 3).join('；'));
          }
        })
        .catch((reason: unknown) => {
          if (mounted.current && generation.current === epoch)
            setError(messageOf(reason));
        })
        .finally(() => {
          imports.current.delete(token);
          if (mounted.current) setImporting(imports.current.size > 0);
        });
      importChain.current = task;
      return task;
    },
    [commit, schedule, selectItem],
  );

  const remove = useCallback(
    (id: string) => {
      const index = itemsRef.current.findIndex((item) => item.id === id);
      if (index < 0) return;
      const item = itemsRef.current[index];
      if (running.current?.id === id) running.current.controller.abort();
      release(item);
      commit((current) => current.filter((entry) => entry.id !== id));
      if (activeIdRef.current === id) {
        selectionIntent.current += 1;
        const replacement =
          itemsRef.current[Math.min(index, itemsRef.current.length - 1)];
        activeIdRef.current = replacement?.id ?? null;
        setActiveIdState(activeIdRef.current);
      }
      schedule();
    },
    [commit, schedule],
  );

  const clear = useCallback(() => {
    generation.current += 1;
    selectionIntent.current += 1;
    running.current?.controller.abort();
    for (const controller of importControllers.current) controller.abort();
    importControllers.current.clear();
    imports.current.clear();
    importChain.current = Promise.resolve();
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    for (const item of itemsRef.current) release(item);
    commit(() => []);
    activeIdRef.current = null;
    setActiveIdState(null);
    setImporting(false);
    setError(null);
  }, [commit]);

  const updateSettings = useCallback(
    (patch: Partial<EncodeSettings>) => {
      const active = itemsRef.current.find(
        (item) => item.id === activeIdRef.current,
      );
      if (!active) {
        defaultsRef.current = mergeSettings(defaultsRef.current, patch);
        setDefaults(defaultsRef.current);
        return;
      }
      const settings = mergeSettings(active.settings, patch);
      if (sameSettings(active.settings, settings)) return;
      if (running.current?.id === active.id) running.current.controller.abort();
      commit((current) =>
        current.map((item) =>
          item.id === active.id
            ? {
                ...item,
                settings,
                revision: item.revision + 1,
                status: 'queued',
                error: undefined,
              }
            : item,
        ),
      );
      schedule();
    },
    [commit, schedule],
  );

  const applyToAll = useCallback(() => {
    const active = itemsRef.current.find(
      (item) => item.id === activeIdRef.current,
    );
    if (!active) return;
    const settings = { ...active.settings };
    defaultsRef.current = settings;
    setDefaults(settings);
    commit((current) =>
      current.map((item) => {
        if (sameSettings(item.settings, settings)) return item;
        if (running.current?.id === item.id) running.current.controller.abort();
        return {
          ...item,
          settings: { ...settings },
          revision: item.revision + 1,
          status: 'queued',
          error: undefined,
        };
      }),
    );
    schedule();
  }, [commit, schedule]);

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((entry) => entry.id === id);
      if (!item) return;
      if (running.current?.id === id) running.current.controller.abort();
      commit((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: 'queued',
                revision: entry.revision + 1,
                error: undefined,
              }
            : entry,
        ),
      );
      schedule();
    },
    [commit, schedule],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
      running.current?.controller.abort();
      for (const controller of importControllers.current) controller.abort();
      for (const item of itemsRef.current) release(item);
      itemsRef.current = [];
      imports.current.clear();
      importControllers.current.clear();
    };
  }, []);

  return {
    items,
    active: items.find((item) => item.id === activeId) ?? null,
    activeId,
    setActiveId,
    addFiles,
    remove,
    clear,
    updateSettings,
    applyToAll,
    retry,
    defaults,
    error,
    setError,
    importing,
  };
}
