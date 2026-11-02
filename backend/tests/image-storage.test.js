import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DataStore } from '../services/data-store.js';

let dir, store, cat, sub;
const source = 'https://example.com/icon.png';
const gallery = ['https://example.com/one.png', 'https://example.com/two.png'];
const local = '/uploads/icons/' + 'a'.repeat(64) + '.webp';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-images-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  store = new DataStore(dir);
  cat = store.createCategory({ name: 'Images' });
  sub = store.createSubCategory(cat.id, { name: 'Test' });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function createLink(extra = {}) {
  return store.createLink(cat.id, sub.id, { favicon: source, faviconDark: source, imageGallery: gallery, ...extra });
}
function cache(kind, url, localUrl) {
  const filename = path.join(store.getUploadsDir(), localUrl.slice('/uploads/'.length));
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, 'fixture');
  store.setCachedImage(kind, url, localUrl);
}

describe('local image persistence', () => {
  it('defaults icons on and gallery off and keeps switches independent', () => {
    expect(store.getSettings()).toMatchObject({ localIcons: true, localGallery: false });
    expect(store.updateSettings({ localGallery: true })).toMatchObject({ localIcons: true, localGallery: true });
    expect(store.updateSettings({ localIcons: false })).toMatchObject({ localIcons: false, localGallery: true });
  });

  it('projects cached display URLs while preserving sources and canonical data', () => {
    const link = createLink();
    cache('icons', source, local);
    const projected = store.projectLink(link);
    expect(projected.favicon).toBe(local);
    expect(projected.faviconDark).toBe(local);
    expect(projected.imageSources).toEqual({ favicon: source, faviconDark: source, imageGallery: gallery });
    expect(store.getAllCategories().find(c => c.id === cat.id).subCategories[0].links[0].favicon).toBe(source);
    store.updateSettings({ localIcons: false });
    expect(store.projectLink(link).favicon).toBe(source);
  });

  it('reverts to sources for missing cached files and repairs persisted mappings on restart', () => {
    const link = createLink();
    cache('icons', source, local);
    store = new DataStore(dir);
    expect(store.projectLink(link).favicon).toBe(local);
    fs.unlinkSync(path.join(dir, local.slice(1)));
    expect(store.projectLink(link).favicon).toBe(source);
  });

  it('keeps cache tied to URLs after gallery reorder, edits, and deletions', () => {
    store.updateSettings({ localGallery: true });
    const link = createLink();
    const first = '/uploads/gallery/' + 'b'.repeat(64) + '.webp';
    cache('gallery', gallery[0], first);
    const updated = store.updateLink(cat.id, sub.id, link.id, { imageGallery: [gallery[1], gallery[0]] });
    expect(store.projectLink(updated).imageGallery).toEqual([gallery[1], first]);
    store.updateLink(cat.id, sub.id, link.id, { favicon: 'https://example.com/new.png', imageGallery: [] });
    expect(store.getImageSources()).not.toContainEqual({ kind: 'gallery', source: gallery[0] });
    store.deleteLink(cat.id, sub.id, link.id);
    expect(store.getImageSources()).toEqual([]);
  });

  it('rejects cache paths outside generated WebP folders', () => {
    expect(() => store.setCachedImage('icons', source, '/uploads/../auth-config.json')).toThrow();
    expect(() => store.setCachedImage('other', source, local)).toThrow();
  });
});
