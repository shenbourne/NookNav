import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { safeGet } from '../services/security.js';
const axios = createRequire(import.meta.url)('axios');

afterEach(() => vi.restoreAllMocks());
const options = { responseType: 'arraybuffer', maxContentLength: 10 * 1024 * 1024, allowedContentTypes: /^(image\/|application\/octet-stream)/i };

describe('safe binary image download', () => {
  it('requests bounded binary data with pinned lookup and retains HTML defaults', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ status: 200, headers: { 'content-type': 'image/png' }, data: Buffer.from('png') });
    const result = await safeGet('https://8.8.8.8/image', options);
    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(get.mock.calls[0][1]).toMatchObject({ responseType: 'arraybuffer', maxContentLength: 10485760, maxRedirects: 0, proxy: false });
    const callback = vi.fn();
    get.mock.calls[0][1].lookup('8.8.8.8', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    await expect(safeGet('https://8.8.8.8/image')).rejects.toThrow();
  });

  it('rejects redirect to private targets before making the second request', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ status: 302, headers: { location: 'http://127.0.0.1/secret' } });
    await expect(safeGet('https://8.8.8.8/image', options)).rejects.toThrow(/本机|内网/);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('rejects HTML and non-success responses even if the body looks like an image', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ status: 200, headers: { 'content-type': 'text/html' }, data: Buffer.from('png') });
    await expect(safeGet('https://8.8.8.8/image', options)).rejects.toThrow();
    get.mockResolvedValue({ status: 404, headers: { 'content-type': 'image/png' } });
    await expect(safeGet('https://8.8.8.8/image', options)).rejects.toThrow(/404/);
  });
});
