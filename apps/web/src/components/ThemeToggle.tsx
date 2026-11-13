import { getNextTheme, type Theme } from '../theme';

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const nextTheme = getNextTheme(theme);

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Activer le thème ${nextTheme === 'dark' ? 'sombre' : 'clair'}`}
      onClick={onToggle}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'dark' ? '☼' : '☾'}
      </span>
      <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
    </button>
  );
}
