const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const sharp = require('sharp');
const decodeIco = require('decode-ico');
const { safeGet } = require('./security');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40 * 1000 * 1000;

function imageCacheUrl(kind, source) {
  // A new URL also bypasses browser caches containing the previous lossy icon.
  const key = kind === 'icons' ? `lossless-v1:${source}` : source;
  const hash = nodeCrypto.createHash('sha256').update(key).digest('hex');
  return `/uploads/${kind}/${hash}.webp`;
}

function imagePipeline(data) {
  if (data.length < 6 || data.readUInt32LE(0) !== 0x00010000) {
    return sharp(data, { animated: true, limitInputPixels: MAX_PIXELS });
  }
  const count = data.readUInt16LE(4);
  if (!count || count > 256 || data.length < 6 + count * 16) {
    throw new Error('ICO 图片目录无效');
  }
  // Decode only the largest frame, bounding BMP allocations before decoding.
  const entries = Array.from({ length: count }, (_, i) => {
    const index = 6 + i * 16;
    return {
      index, width: data[index] || 256, height: data[index + 1] || 256,
      size: data.readUInt32LE(index + 8), offset: data.readUInt32LE(index + 12),
    };
  }).sort((a, b) => b.width * b.height - a.width * a.height);
  const frame = entries[0];
  if (frame.offset < 6 + count * 16 || frame.size < 8 || frame.offset + frame.size > data.length) {
    throw new Error('ICO 图片数据不完整');
  }
  const body = data.subarray(frame.offset, frame.offset + frame.size);
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return sharp(body, { limitInputPixels: MAX_PIXELS });
  }
  if (body.length < 40 || body.readUInt32LE(0) !== 40
    || body.readInt32LE(4) !== frame.width || body.readInt32LE(8) !== frame.height * 2) {
    throw new Error('ICO 位图尺寸或格式无效');
  }
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  data.copy(header, 6, frame.index, frame.index + 16);
  header.writeUInt32LE(22, 18);
  const [decoded] = decodeIco(Buffer.concat([header, body]));
  return sharp(Buffer.from(decoded.data), {
    raw: { width: decoded.width, height: decoded.height, channels: 4 },
    limitInputPixels: MAX_PIXELS,
  });
}

async function downloadImage(source) {
  const response = await safeGet(source, {
    responseType: 'arraybuffer',
    maxContentLength: MAX_BYTES,
    timeout: 12000,
    allowedContentTypes: /^(image\/[^;]+|application\/octet-stream)(?:;|$)/i,
    headers: { Accept: 'image/*', 'User-Agent': 'NavSite/1.0' },
  });
  return Buffer.from(response.data);
}

/** A resumable, two-worker cache. Canonical link data is never rewritten. */
class ImageStorage {
  constructor(store, { download = downloadImage } = {}) {
    this.store = store;
    this.download = download;
    this.failures = new Map();
    this.running = false;
    this.rescan = false;
    this.revision = Date.now();
    this.idle = Promise.resolve();
  }

  status() {
    const sources = this.store.getImageSources();
    const cache = this.store.getImageCache();
    const errors = [];
    let completed = 0;
    for (const item of sources) {
      if (this.currentCachedImage(item, cache)) {
        completed++;
      } else {
        const error = this.failures.get(`${item.kind}:${item.source}`);
        if (error) errors.push({ ...item, error });
      }
    }
    return { running: this.running, total: sources.length, completed, failed: errors.length, errors, revision: this.revision };
  }

  start({ retry = false } = {}) {
    if (retry) this.failures.clear();
    this.rescan = true;
    this.revision++;
    if (this.running) return;
    this.running = true;
    this.idle = Promise.resolve().then(() => this.drain()).catch(err => {
      console.error('[image-storage] 迁移异常:', err.message);
    }).finally(() => {
      this.running = false;
      this.revision++;
    });
  }

  whenIdle() {
    return this.idle;
  }

  currentCachedImage({ kind, source }, cache) {
    const localUrl = this.store.getCachedImage(kind, source, cache);
    return kind === 'icons' && localUrl !== imageCacheUrl(kind, source) ? null : localUrl;
  }

  async drain() {
    while (this.rescan) {
      this.rescan = false;
      const cache = this.store.getImageCache();
      const pending = this.store.getImageSources().filter(item =>
        !this.currentCachedImage(item, cache)
        && !this.failures.has(`${item.kind}:${item.source}`));
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const item = pending[cursor++];
          const settings = this.store.getSettings();
          if (!(item.kind === 'icons' ? settings.localIcons : settings.localGallery)) continue;
          try {
            await this.cacheImage(item);
            this.failures.delete(`${item.kind}:${item.source}`);
          } catch (err) {
            this.failures.set(`${item.kind}:${item.source}`, err.message || '图片转换失败');
          }
          this.revision++;
        }
      };
      await Promise.all([worker(), worker()]);
    }
  }

  async cacheImage({ kind, source }) {
    const localUrl = imageCacheUrl(kind, source);
    const hash = path.basename(localUrl, '.webp');
    const folder = path.join(this.store.getUploadsDir(), kind);
    const filename = path.join(folder, `${hash}.webp`);
    await fs.promises.mkdir(folder, { recursive: true });
    // A crash can leave a complete file before its manifest entry was saved.
    if (fs.existsSync(filename)) {
      try {
        // Buffer input avoids libvips retaining an open Windows file handle.
        if ((await sharp(await fs.promises.readFile(filename)).metadata()).format === 'webp') {
          this.store.setCachedImage(kind, source, localUrl);
          return;
        }
      } catch { /* Replace an incomplete cache file. */ }
    }
    const data = await this.download(source);
    if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_BYTES) {
      throw new Error('图片为空或超过 10 MB 限制');
    }
    const temporary = path.join(folder, `${hash}.${nodeCrypto.randomUUID()}.tmp`);
    try {
      await imagePipeline(data)
        .webp(kind === 'icons' ? { lossless: true, effort: 4 } : { quality: 85, effort: 4 })
        .timeout({ seconds: 15 })
        .toFile(temporary);
      await fs.promises.rename(temporary, filename);
      this.store.setCachedImage(kind, source, localUrl);
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  }
}

module.exports = { ImageStorage };
