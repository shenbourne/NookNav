import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataStore } from '../services/data-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.join(__dirname, 'test-data');

describe('DataStore', () => {
  let store;

  beforeEach(() => {
    // Clean up test data dir
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    store = new DataStore(TEST_DATA_DIR);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  // --- Auth ---
  describe('Auth', () => {
    it('should return auth config with username and hashed password', () => {
      const config = store.getAuthConfig();
      expect(config).toHaveProperty('username');
      expect(config).toHaveProperty('password');
      expect(config).toHaveProperty('jwtSecret');
    });

    it('should update auth config', () => {
      store.updateAuthConfig({ username: 'newuser' });
      const config = store.getAuthConfig();
      expect(config.username).toBe('newuser');
    });
  });

  // --- Category ---
  describe('Category', () => {
    it('should create a category', () => {
      const cat = store.createCategory({ name: 'Test Cat', icon: '🔥' });
      expect(cat).toHaveProperty('id');
      expect(cat.name).toBe('Test Cat');
      expect(cat.icon).toBe('🔥');
      expect(cat.subCategories).toEqual([]);
    });

    it('should get all categories sorted by order', () => {
      store.createCategory({ name: 'A' });
      store.createCategory({ name: 'B' });
      const cats = store.getAllCategories();
      expect(cats.length).toBeGreaterThanOrEqual(2);
      expect(cats[0].order).toBeLessThanOrEqual(cats[1].order);
    });

    it('should update a category', () => {
      const cat = store.createCategory({ name: 'Old' });
      const updated = store.updateCategory(cat.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('should return null for non-existent category update', () => {
      const result = store.updateCategory('nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('should delete a category', () => {
      const cat = store.createCategory({ name: 'ToDelete' });
      const ok = store.deleteCategory(cat.id);
      expect(ok).toBe(true);
      const cats = store.getAllCategories();
      expect(cats.find(c => c.id === cat.id)).toBeUndefined();
    });

    it('should reorder categories', () => {
      const cat1 = store.createCategory({ name: 'First' });
      const cat2 = store.createCategory({ name: 'Second' });
      store.reorderCategories([cat2.id, cat1.id]);
      const cats = store.getAllCategories();
      const idx1 = cats.findIndex(c => c.id === cat1.id);
      const idx2 = cats.findIndex(c => c.id === cat2.id);
      expect(idx2).toBeLessThan(idx1);
    });
  });

  // --- SubCategory ---
  describe('SubCategory', () => {
    let catId;

    beforeEach(() => {
      catId = store.createCategory({ name: 'Parent' }).id;
    });

    it('should create a sub-category', () => {
      const sub = store.createSubCategory(catId, { name: 'Sub', color: '#ff0000' });
      expect(sub).toHaveProperty('id');
      expect(sub.name).toBe('Sub');
      expect(sub.color).toBe('#ff0000');
      expect(sub.links).toEqual([]);
    });

    it('should return null for non-existent category', () => {
      const sub = store.createSubCategory('bad-id', { name: 'Sub' });
      expect(sub).toBeNull();
    });

    it('should update a sub-category', () => {
      const sub = store.createSubCategory(catId, { name: 'Old' });
      const updated = store.updateSubCategory(catId, sub.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('should delete a sub-category', () => {
      const sub = store.createSubCategory(catId, { name: 'ToDelete' });
      const ok = store.deleteSubCategory(catId, sub.id);
      expect(ok).toBe(true);
    });

    it('should move a sub-category to another category', () => {
      const cat2 = store.createCategory({ name: 'Target' });
      const sub = store.createSubCategory(catId, { name: 'Moving' });
      const moved = store.moveSubCategory(sub.id, catId, cat2.id);
      expect(moved).not.toBeNull();
      expect(moved.id).toBe(sub.id);
    });
  });

  // --- Link ---
  describe('Link', () => {
    let catId, subId;

    beforeEach(() => {
      catId = store.createCategory({ name: 'Parent' }).id;
      subId = store.createSubCategory(catId, { name: 'Sub' }).id;
    });

    it('should create a link', () => {
      const link = store.createLink(catId, subId, { title: 'Google', url: 'https://google.com' });
      expect(link).toHaveProperty('id');
      expect(link.title).toBe('Google');
      expect(link.url).toBe('https://google.com');
    });

    it('should update a link', () => {
      const link = store.createLink(catId, subId, { title: 'Old', url: 'https://old.com' });
      const updated = store.updateLink(catId, subId, link.id, { title: 'New' });
      expect(updated.title).toBe('New');
      expect(updated.url).toBe('https://old.com'); // unchanged
    });

    it('persists icon scale when creating, updating and reopening a link', () => {
      const link = store.createLink(catId, subId, { title: 'Scaled', url: 'https://x.com', iconScale: 150 });
      expect(link.iconScale).toBe(150);
      store.updateLink(catId, subId, link.id, { iconScale: 180 });
      const reopened = new DataStore(TEST_DATA_DIR);
      const saved = reopened.getAllCategories().find(cat => cat.id === catId)
        .subCategories.find(sub => sub.id === subId).links.find(item => item.id === link.id);
      expect(saved.iconScale).toBe(180);
      expect(store.updateLink(catId, subId, link.id, { iconScale: 900 }).iconScale).toBe(200);
      expect(store.updateLink(catId, subId, link.id, { iconScale: -1 }).iconScale).toBe(50);
      expect(store.updateLink(catId, subId, link.id, { iconScale: 'invalid' }).iconScale).toBe(100);
      expect(store.createLink(catId, subId, { title: 'Default', url: 'https://x.com' }).iconScale).toBe(100);
    });

    it('should delete a link', () => {
      const link = store.createLink(catId, subId, { title: 'ToDelete', url: 'https://x.com' });
      const ok = store.deleteLink(catId, subId, link.id);
      expect(ok).toBe(true);
    });

    it('should move a link to another sub-category', () => {
      const sub2 = store.createSubCategory(catId, { name: 'Sub2' });
      const link = store.createLink(catId, subId, { title: 'Moving', url: 'https://x.com' });
      const moved = store.moveLink(link.id, catId, subId, catId, sub2.id);
      expect(moved).not.toBeNull();
      expect(moved.id).toBe(link.id);
    });
  });

  // --- Settings ---
  describe('Settings', () => {
    it('should return default settings', () => {
      const settings = store.getSettings();
      expect(settings).toHaveProperty('title');
      expect(settings).toHaveProperty('logoUrl');
    });

    it('should update settings', () => {
      store.updateSettings({ title: 'New Title' });
      const settings = store.getSettings();
      expect(settings.title).toBe('New Title');
    });
  });
});
