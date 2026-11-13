import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes using Argon2id and verifies only the matching password', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(
      true,
    );
    await expect(hasher.verify(hash, 'incorrect password')).resolves.toBe(false);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    await expect(hasher.verify('not-a-hash', 'password')).resolves.toBe(false);
  });
});
