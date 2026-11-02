import { it, expect, vi, afterEach } from 'vitest';
import { reactive, effectScope, nextTick } from '../../frontend/node_modules/vue/index.mjs';
import { useFavicon } from '../../frontend/src/composables/useFavicon.js';

vi.mock('../../frontend/src/stores/uiStore.js', () => ({ useUiStore: () => ({ theme: 'light' }) }));
vi.mock('../../frontend/src/stores/navStore.js', () => ({ useNavStore: () => ({ accelerateUrl: url => url }) }));
let scope;
afterEach(() => scope?.stop());

it('updates mounted favicon and clears failed-load state when migration replaces a link', async () => {
  const props = reactive({ link: { favicon: 'https://example.com/source.png', title: 'Original' } });
  scope = effectScope();
  const icon = scope.run(() => useFavicon(() => props.link));
  expect(icon.displayFavicon.value).toBe(props.link.favicon);
  icon.faviconError.value = true;
  props.link = { favicon: '/uploads/icons/cache.webp', title: 'Cached' };
  await nextTick();
  expect(icon.displayFavicon.value).toBe('/uploads/icons/cache.webp');
  expect(icon.faviconError.value).toBe(false);
  expect(icon.fallbackLetter.value).toBe('C');
  props.link = { favicon: 'https://example.com/source.png', title: 'Original' };
  await nextTick();
  expect(icon.displayFavicon.value).toBe('https://example.com/source.png');
});

it('reacts to saved icon scaling while leaving the image URL unchanged', async () => {
  const props = reactive({ link: { favicon: 'https://example.com/icon.png' } });
  scope = effectScope();
  const icon = scope.run(() => useFavicon(() => props.link));
  expect(icon.iconStyle.value.transform).toBe('scale(1)');
  props.link.iconScale = 180;
  await nextTick();
  expect(icon.iconStyle.value.transform).toBe('scale(1.8)');
  expect(icon.displayFavicon.value).toBe('https://example.com/icon.png');
  props.link = { favicon: 'https://example.com/other.png', iconScale: 50 };
  await nextTick();
  expect(icon.iconStyle.value.transform).toBe('scale(0.5)');
});
