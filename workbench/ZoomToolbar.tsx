import { Button, NumberField, Tooltip } from '@heroui/react';
import { Minus, Plus, Scan } from 'lucide-react';
import type { ViewportControls } from './ImageViewport';

export default function ZoomToolbar({
  controls,
  disabled,
}: {
  controls: ViewportControls | null;
  disabled: boolean;
}) {
  const unavailable = disabled || !controls;
  return (
    <div className="zoom-toolbar" role="group" aria-label="画布缩放">
      <Tooltip delay={350}>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label="缩小"
          isDisabled={unavailable}
          onPress={() => controls?.zoomOut()}
        >
          <Minus size={15} />
        </Button>
        <Tooltip.Content>缩小</Tooltip.Content>
      </Tooltip>
      <NumberField
        className="zoom-value"
        aria-label="画布缩放比例"
        minValue={1}
        maxValue={3200}
        step={0.1}
        value={controls ? Math.round(controls.percent * 10) / 10 : 100}
        formatOptions={{ maximumFractionDigits: 1, useGrouping: false }}
        isDisabled={unavailable}
        onChange={(value) => {
          if (Number.isFinite(value)) controls?.setPercent(value);
        }}
      >
        <NumberField.Group>
          <NumberField.Input />
          <span aria-hidden="true">%</span>
        </NumberField.Group>
      </NumberField>
      <Tooltip delay={350}>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label="放大"
          isDisabled={unavailable}
          onPress={() => controls?.zoomIn()}
        >
          <Plus size={15} />
        </Button>
        <Tooltip.Content>放大</Tooltip.Content>
      </Tooltip>
      <span className="toolbar-separator" />
      <Tooltip delay={350}>
        <Button
          className="zoom-mode"
          size="sm"
          variant="ghost"
          aria-label="原始像素 1:1"
          aria-keyshortcuts="Shift+0"
          aria-pressed={controls?.mode === 'actual'}
          isDisabled={unavailable}
          onPress={() => controls?.actual()}
        >
          1:1
        </Button>
        <Tooltip.Content>原始像素 · Shift+0</Tooltip.Content>
      </Tooltip>
      <Tooltip delay={350}>
        <Button
          className="zoom-mode"
          size="sm"
          variant="ghost"
          aria-label="适应画布"
          aria-keyshortcuts="Shift+1"
          aria-pressed={controls?.mode === 'fit'}
          isDisabled={unavailable}
          onPress={() => controls?.fit()}
        >
          <Scan size={15} />
          <span>适应</span>
        </Button>
        <Tooltip.Content>适应画布 · Shift+1</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
