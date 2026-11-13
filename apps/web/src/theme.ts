export type Theme = 'light' | 'dark';

export function getInitialTheme(
  savedTheme: string | null,
  systemTheme: Theme,
): Theme {
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return systemTheme;
}

export function getNextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
