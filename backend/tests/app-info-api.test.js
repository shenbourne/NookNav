import { it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { signSessionToken } from '../services/security.js';
const require = createRequire(import.meta.url);
let dir, server, origin, token, backend, get;
const oldDir = process.env.NAV_DATA_DIR;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nook-about-api-'));
  process.env.NAV_DATA_DIR = dir;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  get = vi.spyOn(require('axios'), 'get');
  backend = require('../server.js');
  token = signSessionToken(backend.store.getAuthConfig());
  server = backend.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await backend?.imageStorage.whenIdle();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (oldDir === undefined) {
    delete process.env.NAV_DATA_DIR;
  } else {
    process.env.NAV_DATA_DIR = oldDir;
  }
  vi.restoreAllMocks();
  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
it('protects metadata and checks without contacting GitHub', async () => {
  for (const route of ['/api/app-info', '/api/app-info/updates']) {
    expect((await fetch(origin + route)).status).toBe(401);
  }
  const response = await fetch(origin + '/api/app-info', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect((await response.json()).data).toMatchObject({ name: 'NookNav', deployment: 'source' });
  expect(get).not.toHaveBeenCalled();
});
it('returns a recoverable failure, then a validated release', async () => {
  const options = { headers: { Authorization: `Bearer ${token}` } };
  get.mockRejectedValueOnce(new Error('offline'));
  expect((await fetch(origin + '/api/app-info/updates', options)).status).toBe(502);
  get.mockResolvedValueOnce({ data: { tag_name: 'v99.0.0', draft: false, prerelease: false } });
  const response = await fetch(origin + '/api/app-info/updates', options);
  expect((await response.json()).data).toMatchObject({
    status: 'available',
    latestVersion: 'v99.0.0',
  });
  expect(get).toHaveBeenLastCalledWith(
    'https://api.github.com/repos/shenbourne/NookNav/releases/latest',
    expect.objectContaining({ timeout: 8000, maxRedirects: 0 })
  );
});
