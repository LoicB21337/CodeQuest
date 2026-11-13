import { hasPermission } from './authorization';

describe('authorization', () => {
  it('grants only permissions explicitly present on the principal', () => {
    const principal = { permissions: new Set(['users.read']) };

    expect(hasPermission(principal, 'users.read')).toBe(true);
    expect(hasPermission(principal, 'users.write')).toBe(false);
  });
});
