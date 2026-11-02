import { describe, it, expect } from 'vitest';
import { createImageFields, imageSourceUrl } from '../../frontend/src/composables/useImageForm.js';

const link = {
  favicon: '/uploads/icons/light.webp', faviconDark: '/uploads/icons/dark.webp',
  imageGallery: ['/uploads/gallery/one.webp', 'https://example.com/two.png'],
  imageSources: {
    favicon: 'https://example.com/light.png', faviconDark: 'https://example.com/dark.png',
    imageGallery: ['https://example.com/one.png', 'https://example.com/two.png'],
  },
};

describe('image editor display paths and original sources', () => {
  it('shows actual local paths while retaining remote sources for buttons and saving', () => {
    const form = createImageFields(link);
    expect(form.favicon).toBe(link.favicon);
    expect(form.faviconDark).toBe(link.faviconDark);
    expect(form.imageGallery.map(row => row.url)).toEqual(link.imageGallery);
    expect(imageSourceUrl(form.favicon, form.imageOrigins.favicon)).toBe(link.imageSources.favicon);
    expect(imageSourceUrl(form.faviconDark, form.imageOrigins.faviconDark)).toBe(link.imageSources.faviconDark);
    expect(form.imageGallery.map(row => imageSourceUrl(row.url, row.origin))).toEqual(link.imageSources.imageGallery);
  });

  it('uses newly entered URLs or empty values instead of restoring stale sources', () => {
    const form = createImageFields(link);
    expect(imageSourceUrl('https://example.com/new.png', form.imageOrigins.favicon)).toBe('https://example.com/new.png');
    expect(imageSourceUrl('', form.imageOrigins.faviconDark)).toBe('');
    expect(imageSourceUrl('/uploads/manual.webp')).toBe('/uploads/manual.webp');
    expect(createImageFields().imageGallery).toEqual([]);
  });

  it('keeps origins attached to gallery rows across reorder and deletion, including old links without source fields', () => {
    const form = createImageFields(link);
    form.imageGallery.reverse();
    expect(form.imageGallery.map(row => imageSourceUrl(row.url, row.origin))).toEqual([...link.imageSources.imageGallery].reverse());
    form.imageGallery.splice(0, 1);
    expect(imageSourceUrl(form.imageGallery[0].url, form.imageGallery[0].origin)).toBe(link.imageSources.imageGallery[0]);
    const legacy = createImageFields({ favicon: '/uploads/old.webp', imageGallery: ['https://example.com/old.png'] });
    expect(imageSourceUrl(legacy.favicon, legacy.imageOrigins.favicon)).toBe('/uploads/old.webp');
    expect(imageSourceUrl(legacy.imageGallery[0].url, legacy.imageGallery[0].origin)).toBe('https://example.com/old.png');
  });
});
