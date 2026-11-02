import { it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { signSessionToken } from '../services/security.js';

const require = createRequire(import.meta.url);
let dir, server, origin, token, store, imageStorage;
const oldDataDir = process.env.NAV_DATA_DIR;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-image-api-'));
  process.env.NAV_DATA_DIR = dir;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const backend = require('../server.js');
  store = backend.store;
  imageStorage = backend.imageStorage;
  token = signSessionToken(store.getAuthConfig());
  server = backend.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await imageStorage?.whenIdle();
  if (server) await new Promise(resolve => server.close(resolve));
  if (oldDataDir === undefined) delete process.env.NAV_DATA_DIR;
  else process.env.NAV_DATA_DIR = oldDataDir;
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
const request = (url, options = {}) => fetch(origin + url, {
  ...options,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
});

it('requires authentication for migration status and retry', async () => {
  const result = await request('/api/settings/image-storage');
  expect(result.status).toBe(200);
  expect((await result.json()).data).toMatchObject({ failed: 0 });
  expect((await fetch(origin + '/api/settings/image-storage')).status).toBe(401);
  expect((await fetch(origin + '/api/settings/image-storage/retry', { method: 'POST' })).status).toBe(401);
  expect((await request('/api/settings/image-storage/retry', { method: 'POST' })).status).toBe(200);
});

it('serves only generated WebP paths and retains logo behavior', async () => {
  const folder = path.join(dir, 'uploads', 'icons');
  fs.mkdirSync(folder, { recursive: true });
  const file = 'a'.repeat(64) + '.webp';
  fs.writeFileSync(path.join(folder, file), Buffer.from('RIFF0000WEBP'));
  fs.writeFileSync(path.join(folder, 'active.svg'), '<svg/>');
  const response = await request('/uploads/icons/' + file);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('image/webp');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect((await request('/uploads/icons/active.svg')).status).toBe(404);
  expect((await request('/uploads/icons/arbitrary.webp')).status).toBe(404);
  expect((await request('/uploads/auth-config.json')).status).toBe(404);
});

it('migrates new and existing images, returns sources, and restores external URLs when switched off', async () => {
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'red' } }).png().toBuffer();
  expect(imageStorage).toBeDefined();
  imageStorage.download = async () => png;
  const cat = store.createCategory({ name: 'Test' });
  const sub = store.createSubCategory(cat.id, { name: 'Sub' });
  const endpoint = `/api/categories/${cat.id}/subcategories/${sub.id}/links`;
  const source = 'https://example.com/source.png';
  const create = await request(endpoint, { method: 'POST', body: JSON.stringify({ favicon: source, imageGallery: [source] }) });
  const link = (await create.json()).data;
  expect(link.imageSources?.favicon).toBe(source);
  await imageStorage.whenIdle();
  let data = (await (await request('/api/categories')).json()).data;
  let displayed = data.find(c => c.id === cat.id).subCategories[0].links[0];
  expect(displayed.favicon).toMatch(/^\/uploads\/icons\//);
  expect(displayed.imageGallery).toEqual([source]);
  const updatedCat = (await (await request(`/api/categories/${cat.id}`, {
    method: 'PUT', body: JSON.stringify({ name: 'Renamed' }),
  })).json()).data;
  expect(updatedCat.subCategories[0].links[0].favicon).toMatch(/^\/uploads\/icons\//);
  const updatedSub = (await (await request(`/api/categories/${cat.id}/subcategories/${sub.id}`, {
    method: 'PUT', body: JSON.stringify({ name: 'Renamed sub' }),
  })).json()).data;
  expect(updatedSub.links[0].favicon).toMatch(/^\/uploads\/icons\//);
  await request('/api/settings', { method: 'PUT', body: JSON.stringify({ localIcons: false, localGallery: true }) });
  await imageStorage.whenIdle();
  data = (await (await request('/api/categories')).json()).data;
  displayed = data.find(c => c.id === cat.id).subCategories[0].links[0];
  expect(displayed.favicon).toBe(source);
  expect(displayed.imageGallery[0]).toMatch(/^\/uploads\/gallery\//);
  expect(displayed.imageSources.imageGallery).toEqual([source]);
});
