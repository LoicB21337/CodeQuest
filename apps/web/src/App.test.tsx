import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the accessible demo and a named theme control', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('href="#contenu">');
    expect(markup).toContain('aria-label="Navigation principale"');
    expect(markup).toContain('aria-label="Activer le thème clair"');
    expect(markup).not.toContain('aria-pressed');
    expect(markup).toContain('data-theme="dark"');
    expect(markup).toContain('Pas de son nécessaire');
  });
});
