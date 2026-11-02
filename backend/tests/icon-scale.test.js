import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DataStore } from '../services/data-store.js';
import { createImageFields } from '../../frontend/src/composables/useImageForm.js';

let directory;
afterEach(() => {
  vi.restoreAllMocks();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

describe('saved per-link icon scale', () => {
  it('retains scaling across create, update, unrelated edits and reopening the store', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-icon-scale-'));
    const store = new DataStore(directory);
    const category = store.createCategory({ name: 'Test' });
    const subcategory = store.createSubCategory(category.id, { name: 'Test' });
    const link = store.createLink(category.id, subcategory.id, {
      title: 'Scaled', url: 'https://example.com', iconScale: 150,
    });
    expect(link.iconScale).toBe(150);
    expect(store.updateLink(category.id, subcategory.id, link.id, { iconScale: 180 }).iconScale).toBe(180);
    store.updateLink(category.id, subcategory.id, link.id, { title: 'Renamed' });
    const saved = new DataStore(directory).getAllCategories().find(cat => cat.id === category.id)
      .subCategories.find(sub => sub.id === subcategory.id).links.find(item => item.id === link.id);
    expect(saved.iconScale).toBe(180);
    expect(createImageFields(saved).iconScale).toBe(180);
    expect(store.updateLink(category.id, subcategory.id, link.id, { iconScale: 900 }).iconScale).toBe(200);
    expect(store.updateLink(category.id, subcategory.id, link.id, { iconScale: -1 }).iconScale).toBe(50);
    expect(store.updateLink(category.id, subcategory.id, link.id, { iconScale: 'invalid' }).iconScale).toBe(100);
    expect(store.createLink(category.id, subcategory.id, { title: 'Legacy', url: 'https://example.com' }).iconScale).toBe(100);
  });

  it('defaults existing links to their original size and bounds editor values', () => {
    expect(createImageFields().iconScale).toBe(100);
    expect(createImageFields({ iconScale: 200 }).iconScale).toBe(200);
    expect(createImageFields({ iconScale: 999 }).iconScale).toBe(200);
    expect(createImageFields({ iconScale: -1 }).iconScale).toBe(50);
  });
});
