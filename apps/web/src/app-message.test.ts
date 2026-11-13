import { describe, expect, it } from 'vitest';
import { getAppMessage } from './app-message';

describe('getAppMessage', () => {
  it('returns the initial application welcome message', () => {
    expect(getAppMessage()).toBe('Bienvenue sur CodeQuest');
  });
});
