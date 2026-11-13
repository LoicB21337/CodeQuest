import { describe, expect, it } from 'vitest';
import { getInitialTheme, getNextTheme } from './theme';

describe('theme preferences', () => {
  it('uses a saved theme when it is supported and otherwise follows the system', () => {
    expect(getInitialTheme('light', 'dark')).toBe('light');
    expect(getInitialTheme('dark', 'light')).toBe('dark');
    expect(getInitialTheme('sepia', 'light')).toBe('light');
    expect(getInitialTheme(null, 'dark')).toBe('dark');
  });

  it('toggles between the two available themes', () => {
    expect(getNextTheme('dark')).toBe('light');
    expect(getNextTheme('light')).toBe('dark');
  });
});
