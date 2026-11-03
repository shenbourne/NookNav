import { describe, it, expect } from 'vitest';
import { compareVersions, createUpdateChecker } from '../services/app-info.js';

describe('application updates', () => {
  it('compares numeric versions and prereleases', () => {
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.4.10', 'v1.4.10')).toBe(0);
    expect(compareVersions('1.4.10', '1.4.10-rc.1')).toBe(1);
    expect(compareVersions('dev', '1.0.0')).toBe(null);
  });
  it('reports a newer release and caches checks', async () => {
    let calls = 0;
    const check = createUpdateChecker(async () => {
      calls++;
      return { tag_name: 'v1.5.0', prerelease: false, draft: false };
    });
    expect((await check('1.4.10')).status).toBe('available');
    await check('1.4.10');
    expect(calls).toBe(1);
  });
  it('does not treat an older release as an update', async () => {
    const check = createUpdateChecker(async () => ({ tag_name: 'v1.0.0' }));
    expect((await check('1.4.10')).status).toBe('current');
    expect((await check('dev')).status).toBe('unknown');
  });
  it('distinguishes no release from failure and rejects invalid releases', async () => {
    expect((await createUpdateChecker(async () => null)('1.0.0')).status).toBe('unpublished');
    await expect(
      createUpdateChecker(async () => {
        throw Error('offline');
      })('1.0.0')
    ).rejects.toThrow();
    for (const release of [
      { tag_name: 'bad' },
      { tag_name: 'v2.0.0', prerelease: true },
      { tag_name: 'v2.0.0', draft: true },
    ]) {
      await expect(createUpdateChecker(async () => release)('1.0.0')).rejects.toThrow();
    }
  });
});
