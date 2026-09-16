import { useSyncExternalStore } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';
const THEME_EVENT = 'squoosh-theme-change';

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function toggleTheme() {
  const theme: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  const color = theme === 'dark' ? '#191919' : '#f7f8fa';
  const root = document.documentElement;
  root.dataset.themeSwitching = 'true';
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = color;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', color);
  try {
    localStorage.setItem('squoosh-theme', theme);
  } catch {
    // The current page still switches when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      delete root.dataset.themeSwitching;
    }),
  );
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark');
  const label = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';

  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="theme-toggle"
        aria-label={label}
        onPress={toggleTheme}
      >
        {theme === 'dark' ? (
          <Sun size={17} aria-hidden />
        ) : (
          <Moon size={17} aria-hidden />
        )}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
