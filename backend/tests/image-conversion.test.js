import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { DataStore } from '../services/data-store.js';
const require = createRequire(import.meta.url);
let ImageStorage;
try { ({ ImageStorage } = require('../services/image-storage.js')); } catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}
let dir, store, cat, sub, png;
const source = 'https://example.com/icon.png';
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-conversion-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  store = new DataStore(dir);
  cat = store.createCategory({ name: 'Test' });
  sub = store.createSubCategory(cat.id, { name: 'Images' });
  png = await sharp({ create: { width: 2, height: 3, channels: 4, background: '#ff000080' } }).png().toBuffer();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
const add = (extra = {}) => store.createLink(cat.id, sub.id, { favicon: source, faviconDark: source, ...extra });

describe('background WebP migration', () => {
  it('stores icons with pixel-exact lossless WebP while keeping galleries at quality 85', async () => {
    const pixels = Buffer.from(Array.from({ length: 8 * 8 * 4 }, (_, i) => i % 4 === 3 ? 192 : (i * 73) % 256));
    const original = await sharp(pixels, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
    const link = add({ imageGallery: [source] });
    store.updateSettings({ localGallery: true });
    const service = new ImageStorage(store, { download: async () => original });
    service.start(); await service.whenIdle();
    expect(service.status().errors).toEqual([]);
    const displayed = store.projectLink(link);
    const icon = fs.readFileSync(path.join(dir, displayed.favicon.slice(1)));
    expect(await sharp(icon).ensureAlpha().raw().toBuffer()).toEqual(pixels);
    const gallery = fs.readFileSync(path.join(dir, displayed.imageGallery[0].slice(1)));
    expect(gallery).toEqual(await sharp(original, { animated: true, limitInputPixels: 40000000 }).webp({ quality: 85, effort: 4 }).toBuffer());
  });

  it('rebuilds legacy lossy icon caches from original sources and then reuses lossless caches', async () => {
    const { createHash } = require('node:crypto');
    const link = add();
    const hash = createHash('sha256').update(source).digest('hex');
    const oldUrl = `/uploads/icons/${hash}.webp`;
    fs.mkdirSync(path.join(dir, 'uploads/icons'), { recursive: true });
    fs.writeFileSync(path.join(dir, oldUrl.slice(1)), await sharp(png).webp({ quality: 85 }).toBuffer());
    store.setCachedImage('icons', source, oldUrl);
    const download = vi.fn(async () => png);
    const service = new ImageStorage(store, { download });
    expect(service.status().completed).toBe(0);
    service.start(); await service.whenIdle();
    expect(download).toHaveBeenCalledTimes(1);
    expect(store.projectLink(link).favicon).not.toBe(oldUrl);
    expect(service.status().completed).toBe(1);
    const restarted = new ImageStorage(new DataStore(dir), { download });
    restarted.start(); await restarted.whenIdle();
    expect(download).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dir, oldUrl.slice(1)))).toBe(true);
  });

  it('converts actual PNG bytes to transparent WebP, deduplicates and reuses persisted files', async () => {
    const link = add();
    const download = vi.fn(async () => png);
    const service = new ImageStorage(store, { download });
    service.start(); service.start();
    await service.whenIdle();
    expect(download).toHaveBeenCalledTimes(1);
    expect(service.status()).toMatchObject({ running: false, total: 1, completed: 1, failed: 0 });
    const projected = store.projectLink(link);
    expect(projected.favicon).toMatch(/^\/uploads\/icons\/[a-f0-9]{64}\.webp$/);
    const meta = await sharp(fs.readFileSync(path.join(dir, projected.favicon.slice(1)))).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 2, height: 3, hasAlpha: true });
    const restarted = new ImageStorage(new DataStore(dir), { download });
    restarted.start(); await restarted.whenIdle();
    expect(download).toHaveBeenCalledTimes(1);
    fs.unlinkSync(path.join(dir, projected.favicon.slice(1)));
    restarted.start(); await restarted.whenIdle();
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('keeps sources on failure, skips automatic failure loops, and permits explicit retry', async () => {
    const link = add();
    const download = vi.fn(async () => Buffer.from('not an image'));
    const service = new ImageStorage(store, { download });
    service.start(); await service.whenIdle();
    expect(service.status()).toMatchObject({ failed: 1, completed: 0 });
    expect(store.projectLink(link).favicon).toBe(source);
    service.start(); await service.whenIdle();
    expect(download).toHaveBeenCalledTimes(1);
    download.mockResolvedValue(png);
    service.start({ retry: true }); await service.whenIdle();
    expect(service.status()).toMatchObject({ failed: 0, completed: 1 });
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite concurrent edits and respects disabling during a download', async () => {
    const link = add();
    let release;
    const download = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const service = new ImageStorage(store, { download });
    service.start();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    store.updateLink(cat.id, sub.id, link.id, { title: 'Updated while downloading', favicon: 'https://example.com/new.png', faviconDark: '' });
    store.updateSettings({ localIcons: false });
    release(png);
    await service.whenIdle();
    const saved = store.getAllCategories().find(c => c.id === cat.id).subCategories[0].links[0];
    expect(saved.title).toBe('Updated while downloading');
    expect(store.projectLink(saved).favicon).toBe('https://example.com/new.png');
  });

  it('picks up new sources queued during migration and caches galleries independently', async () => {
    add();
    store.updateSettings({ localGallery: true });
    let release;
    const download = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(png);
    const service = new ImageStorage(store, { download });
    service.start();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const link = add({ favicon: 'https://example.com/second.png', imageGallery: [source] });
    service.start(); release(png);
    await service.whenIdle();
    expect(download).toHaveBeenCalledTimes(3);
    expect(store.projectLink(link).imageGallery[0]).toMatch(/^\/uploads\/gallery\//);
    store.updateSettings({ localGallery: false });
    expect(store.projectLink(link).imageGallery).toEqual([source]);
  });

  it('rejects oversized downloads and excessive pixel counts without writing a mapping', async () => {
    add();
    const service = new ImageStorage(store, { download: async () => Buffer.alloc(10 * 1024 * 1024 + 1) });
    service.start(); await service.whenIdle();
    expect(service.status().failed).toBe(1);
    expect(store.getCachedImage('icons', source)).toBeNull();
    const hugeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="10000"><rect width="10000" height="10000"/></svg>');
    const pixels = new ImageStorage(store, { download: async () => hugeSvg });
    pixels.start(); await pixels.whenIdle();
    expect(pixels.status().failed).toBe(1);
  });

  it('converts SVG library icons without serving active source content', async () => {
    const link = add();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>');
    const service = new ImageStorage(store, { download: async () => svg });
    service.start(); await service.whenIdle();
    expect(service.status().failed).toBe(0);
    expect((await sharp(fs.readFileSync(path.join(dir, store.projectLink(link).favicon.slice(1)))).metadata()).format).toBe('webp');
  });

  it('preserves animated GIF frames in WebP output', async () => {
    const link = add();
    const gif = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
    const service = new ImageStorage(store, { download: async () => gif });
    service.start(); await service.whenIdle();
    expect(service.status().failed).toBe(0);
    const meta = await sharp(fs.readFileSync(path.join(dir, store.projectLink(link).favicon.slice(1))), { animated: true }).metadata();
    expect(meta.pages).toBe(2);
  });

  it('converts PNG-backed and bitmap-backed ICO website icons', async () => {
    const wrap = (body, width, height) => {
      const header = Buffer.alloc(22);
      header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
      header[6] = width; header[7] = height;
      header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
      header.writeUInt32LE(body.length, 14); header.writeUInt32LE(22, 18);
      return Buffer.concat([header, body]);
    };
    const bmp = Buffer.alloc(48);
    bmp.writeUInt32LE(40, 0); bmp.writeInt32LE(1, 4); bmp.writeInt32LE(2, 8);
    bmp.writeUInt16LE(1, 12); bmp.writeUInt16LE(32, 14);
    bmp[42] = 255; bmp[43] = 255;
    for (const ico of [wrap(png, 2, 3), wrap(bmp, 1, 1)]) {
      const link = add({ favicon: `https://example.com/${ico.length}.ico`, faviconDark: '' });
      const service = new ImageStorage(store, { download: async () => ico });
      service.start(); await service.whenIdle();
      expect(service.status().errors).toEqual([]);
      expect(store.projectLink(link).favicon).toMatch(/\.webp$/);
    }
  });
});
