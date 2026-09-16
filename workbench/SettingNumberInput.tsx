import { useEffect, useState } from 'react';
import { Input, TextField } from '@heroui/react';

/** Commit valid numbers while typing; encoding state never owns this editor. */
export default function SettingNumberInput({
  value,
  onChange,
  label,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next =
      draft === '' ? value : Math.max(1, Math.min(100, Number(draft)));
    setDraft(String(next));
    onChange(next);
  };
  return (
    <TextField
      className={`setting-number-input ${unit ? 'has-unit' : ''}`}
      aria-label={label}
      value={draft}
      onChange={(next) => {
        if (!/^\d{0,3}$/.test(next)) return;
        setDraft(next);
        const number = Number(next);
        if (next !== '' && number >= 1 && number <= 100) onChange(number);
      }}
    >
      <div className="setting-number-field">
        <Input
          inputMode="numeric"
          autoComplete="off"
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit();
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              const next = Math.max(
                1,
                Math.min(100, value + (event.key === 'ArrowUp' ? step : -step)),
              );
              setDraft(String(next));
              onChange(next);
            }
          }}
        />
        {unit && (
          <span className="setting-number-unit" aria-hidden="true">
            {unit}
          </span>
        )}
      </div>
    </TextField>
  );
}
