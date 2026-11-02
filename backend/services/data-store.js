/**
 * DataStore — Nav-Site 数据持久化层。
 *
 * 封装所有 JSON 文件 I/O，为路由处理器提供一个深度接口：
 * 调用方只关心「做什么」（创建/更新/删除），不关心内部查找/排序/写回。
 *
 * 接口（约 18 个方法）背后隐藏了 ~400 行实现逻辑 —
 * 每一个路由处理器都从中获得了显著的 leverage。
 */
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { validatePassword } = require('./security');

// 旧版本随仓库发布过的签名密钥，任何情况下都不允许继续使用。
const LEGACY_JWT_SECRET = 'nav-site-secret-key-change-in-production';
// 旧版本随仓库发布过的默认管理员密码，启动时检测到即强制轮换。
const LEGACY_ADMIN_PASSWORD = 'admin123';
const MIN_JWT_SECRET_BYTES = 32;

function validateInitialPassword(password, username) {
  return validatePassword(password, { username });
}

function isLegacyPassword(hash) {
  try {
    return bcrypt.compareSync(LEGACY_ADMIN_PASSWORD, hash);
  } catch {
    return false;
  }
}

class DataStore {
  /**
   * @param {string} dataDir — 数据目录路径
   */
  constructor(dataDir) {
    this.DATA_FILE = path.join(dataDir, 'nav-data.json');
    this.AUTH_FILE = path.join(dataDir, 'auth-config.json');
    this.UPLOADS_DIR = path.join(dataDir, 'uploads');

    this.#ensureDataDir(dataDir);
    this.#ensureUploadsDir();
    this.#initDataFile();
    this.#ensureAuthConfig();
  }

  // ---------- private helpers ----------

  #ensureDataDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  #ensureUploadsDir() {
    if (!fs.existsSync(this.UPLOADS_DIR)) {
      fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
    }
  }

  #initDataFile() {
    if (!fs.existsSync(this.DATA_FILE)) {
      const defaultData = {
        siteSettings: { title: 'My Nav 的主页', logoUrl: '' },
        categories: [{ id: 'cat_001', name: '全部', icon: '📋', order: 0 }],
      };
      this.#writeData(defaultData);
      console.log('Created default nav-data.json');
    }
  }

  /**
   * 创建或迁移认证配置。
   *
   * 安全不变量：签名密钥和初始密码都不能来自仓库内容，且旧版发布过的
   * 公开密钥 / 默认密码在启动时一律被替换。迁移是幂等的。
   */
  #ensureAuthConfig() {
    const isNew = !fs.existsSync(this.AUTH_FILE);
    const config = isNew ? { username: 'admin' } : this.#readAuth();
    let changed = isNew;

    if (typeof config.username !== 'string' || !config.username.trim()) {
      config.username = 'admin';
      changed = true;
    }

    // 1) 签名密钥：环境变量优先，其次保留已有的非公开密钥，否则随机生成。
    const envSecret = process.env.NAV_JWT_SECRET || '';
    if (envSecret) {
      if (
        envSecret === LEGACY_JWT_SECRET
        || Buffer.byteLength(envSecret, 'utf8') < MIN_JWT_SECRET_BYTES
        || envSecret.trim() !== envSecret
      ) {
        throw new Error(
          `NAV_JWT_SECRET 必须是至少 ${MIN_JWT_SECRET_BYTES} 字节、首尾无空格的随机值`
        );
      }
      if (config.jwtSecret !== envSecret) {
        config.jwtSecret = envSecret;
        changed = true;
      }
    } else if (!config.jwtSecret || config.jwtSecret === LEGACY_JWT_SECRET) {
      config.jwtSecret = nodeCrypto.randomBytes(32).toString('hex');
      changed = true;
      if (!isNew) {
        console.warn('[auth] 检测到旧版公开的 JWT 签名密钥，已自动轮换（所有旧令牌失效）');
      }
    }

    // 2) 令牌版本：改密/改名时递增，使已签发的令牌立即失效。
    if (!Number.isInteger(config.tokenVersion) || config.tokenVersion < 1) {
      config.tokenVersion = 1;
      changed = true;
    }

    // 3) 初始密码：环境变量 > 保留已有密码 > 随机生成并打印一次。
    let generatedPassword = null;
    if (isNew) {
      const envPassword = process.env.NAV_ADMIN_PASSWORD || '';
      if (envPassword) {
        const error = validateInitialPassword(envPassword, config.username);
        if (error) {
          throw new Error(`NAV_ADMIN_PASSWORD 不符合要求：${error}`);
        }
        config.password = bcrypt.hashSync(envPassword, 10);
      } else {
        generatedPassword = nodeCrypto.randomBytes(12).toString('base64url');
        config.password = bcrypt.hashSync(generatedPassword, 10);
      }
    } else if (!config.password || isLegacyPassword(config.password)) {
      generatedPassword = nodeCrypto.randomBytes(12).toString('base64url');
      config.password = bcrypt.hashSync(generatedPassword, 10);
      changed = true;
      if (!isNew) {
        console.warn('[auth] 检测到旧版公开的默认管理员密码，已自动轮换');
      }
    }

    if (changed) {
      this.#writeAuth(config);
    }

    if (isNew || generatedPassword) {
      const name = config.username;
      console.log('==============================================');
      console.log(`[auth] 管理员账号：${name}`);
      if (generatedPassword) {
        console.log(`[auth] 初始密码（仅本次显示，请立即修改）：${generatedPassword}`);
      } else {
        console.log('[auth] 初始密码来自环境变量 NAV_ADMIN_PASSWORD');
      }
      console.log('[auth] 可在后台「修改密码」中更换。');
      console.log('==============================================');
    }
  }

  #readData() {
    return JSON.parse(fs.readFileSync(this.DATA_FILE, 'utf-8'));
  }

  #writeData(data) {
    fs.writeFileSync(this.DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  #readAuth() {
    return JSON.parse(fs.readFileSync(this.AUTH_FILE, 'utf-8'));
  }

  #writeAuth(config) {
    fs.writeFileSync(this.AUTH_FILE, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  // ---------- public: Auth ----------

  getAuthConfig() {
    return this.#readAuth();
  }

  updateAuthConfig(updates) {
    const config = this.#readAuth();
    Object.assign(config, updates);
    this.#writeAuth(config);
    return config;
  }

  // ---------- public: Category ----------

  getAllCategories() {
    const data = this.#readData();
    data.categories.sort((a, b) => a.order - b.order);
    data.categories.forEach(cat => {
      if (cat.subCategories) {
        cat.subCategories.sort((a, b) => a.order - b.order);
        cat.subCategories.forEach(sub => {
          if (sub.links) sub.links.sort((a, b) => a.order - b.order);
        });
      }
    });
    return data.categories;
  }

  getImageCache() {
    return this.#readData().imageCache || { icons: {}, gallery: {} };
  }

  setCachedImage(kind, source, localUrl) {
    if (!['icons', 'gallery'].includes(kind)
      || typeof source !== 'string'
      || !new RegExp(`^/uploads/${kind}/[a-f0-9]{64}\\.webp$`).test(localUrl)) {
      throw new Error('无效的本地图片映射');
    }
    const data = this.#readData();
    data.imageCache ||= { icons: {}, gallery: {} };
    data.imageCache[kind] ||= {};
    // Read fresh data per update: a background download must never overwrite edits.
    data.imageCache[kind][source] = localUrl;
    this.#writeData(data);
  }

  getCachedImage(kind, source, cache = this.getImageCache()) {
    if (!['icons', 'gallery'].includes(kind)) return null;
    const localUrl = cache[kind]?.[source];
    if (typeof localUrl !== 'string'
      || !new RegExp(`^/uploads/${kind}/[a-f0-9]{64}\\.webp$`).test(localUrl)) return null;
    return fs.existsSync(path.join(this.UPLOADS_DIR, localUrl.slice('/uploads/'.length)))
      ? localUrl : null;
  }

  getImageSources() {
    const result = new Map();
    const settings = this.getSettings();
    const add = (kind, source) => {
      if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
        result.set(`${kind}:${source}`, { kind, source });
      }
    };
    for (const cat of this.getAllCategories()) {
      for (const sub of cat.subCategories || []) {
        for (const link of sub.links || []) {
          if (settings.localIcons) {
            add('icons', link.favicon);
            add('icons', link.faviconDark);
          }
          if (settings.localGallery) {
            for (const source of link.imageGallery || []) add('gallery', source);
          }
        }
      }
    }
    return [...result.values()];
  }

  projectLink(link, settings = this.getSettings(), cache = this.getImageCache()) {
    const resolve = (kind, source, enabled) => enabled
      ? this.getCachedImage(kind, source, cache) || source : source;
    return {
      ...link,
      imageSources: {
        favicon: link.favicon || '',
        faviconDark: link.faviconDark || '',
        imageGallery: [...(link.imageGallery || [])],
      },
      favicon: resolve('icons', link.favicon || '', settings.localIcons),
      faviconDark: resolve('icons', link.faviconDark || '', settings.localIcons),
      imageGallery: (link.imageGallery || []).map(source => resolve('gallery', source, settings.localGallery)),
    };
  }

  getDisplayCategories() {
    const settings = this.getSettings();
    const cache = this.getImageCache();
    return this.getAllCategories().map(cat => this.projectCategory(cat, settings, cache));
  }

  projectSubCategory(sub, settings = this.getSettings(), cache = this.getImageCache()) {
    return { ...sub, links: (sub.links || []).map(link => this.projectLink(link, settings, cache)) };
  }

  projectCategory(cat, settings = this.getSettings(), cache = this.getImageCache()) {
    return {
      ...cat,
      subCategories: (cat.subCategories || []).map(sub => this.projectSubCategory(sub, settings, cache)),
    };
  }

  createCategory({ name, icon }) {
    const data = this.#readData();
    const cat = {
      id: 'cat_' + nanoid(8),
      name: name || 'New Category',
      icon: icon || '📁',
      order: data.categories.length,
      subCategories: [],
    };
    data.categories.push(cat);
    this.#writeData(data);
    return cat;
  }

  updateCategory(catId, { name, icon }) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return null;
    if (name !== undefined) cat.name = name;
    if (icon !== undefined) cat.icon = icon;
    this.#writeData(data);
    return cat;
  }

  deleteCategory(catId) {
    const data = this.#readData();
    const idx = data.categories.findIndex(c => c.id === catId);
    if (idx === -1) return false;
    data.categories.splice(idx, 1);
    data.categories.forEach((c, i) => (c.order = i));
    this.#writeData(data);
    return true;
  }

  reorderCategories(orderedIds) {
    const data = this.#readData();
    const map = new Map(data.categories.map(c => [c.id, c]));
    orderedIds.forEach((id, index) => {
      const cat = map.get(id);
      if (cat) cat.order = index;
    });
    data.categories.sort((a, b) => a.order - b.order);
    this.#writeData(data);
  }

  // ---------- public: SubCategory ----------

  createSubCategory(catId, { name, color }) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return null;
    if (!cat.subCategories) cat.subCategories = [];
    const sub = {
      id: 'sub_' + nanoid(8),
      name: name || 'New Sub-Category',
      color: color || '#4facfe',
      order: cat.subCategories.length,
      links: [],
    };
    cat.subCategories.push(sub);
    this.#writeData(data);
    return sub;
  }

  updateSubCategory(catId, subId, { name, color }) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return null;
    const sub = (cat.subCategories || []).find(s => s.id === subId);
    if (!sub) return null;
    if (name !== undefined) sub.name = name;
    if (color !== undefined) sub.color = color;
    this.#writeData(data);
    return sub;
  }

  deleteSubCategory(catId, subId) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return false;
    const idx = (cat.subCategories || []).findIndex(s => s.id === subId);
    if (idx === -1) return false;
    cat.subCategories.splice(idx, 1);
    cat.subCategories.forEach((s, i) => (s.order = i));
    this.#writeData(data);
    return true;
  }

  moveSubCategory(subId, fromCatId, toCatId) {
    const data = this.#readData();
    const fromCat = data.categories.find(c => c.id === fromCatId);
    if (!fromCat) return null;
    const toCat = data.categories.find(c => c.id === toCatId);
    if (!toCat) return null;
    const subIdx = (fromCat.subCategories || []).findIndex(s => s.id === subId);
    if (subIdx === -1) return null;
    const [sub] = fromCat.subCategories.splice(subIdx, 1);
    fromCat.subCategories.forEach((s, i) => (s.order = i));
    if (!toCat.subCategories) toCat.subCategories = [];
    sub.order = toCat.subCategories.length;
    toCat.subCategories.push(sub);
    this.#writeData(data);
    return sub;
  }

  reorderSubCategories(catId, orderedIds) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return;
    const map = new Map((cat.subCategories || []).map(s => [s.id, s]));
    orderedIds.forEach((id, index) => {
      const sub = map.get(id);
      if (sub) sub.order = index;
    });
    if (cat.subCategories) cat.subCategories.sort((a, b) => a.order - b.order);
    this.#writeData(data);
  }

  // ---------- public: Link ----------

  #sanitizeLinkPayload(payload) {
    return {
      id: 'lnk_' + nanoid(8),
      title: payload.title || '',
      url: payload.url || '',
      description: payload.description || '',
      favicon: payload.favicon || '',
      faviconDark: payload.faviconDark || '',
      iconScale: Math.min(200, Math.max(50, Number(payload.iconScale) || 100)),
      order: payload.order ?? 0,
      platforms: payload.platforms || [],
      imageGallery: (payload.imageGallery || []).filter(img => img && img.trim()),
      detailDescription: payload.detailDescription || '',
      customButtons: (payload.customButtons || [])
        .filter(btn => (btn.label || btn.iconSvg || btn.icon) && btn.url)
        .map(btn => ({
          id: btn.id || 'btn_' + nanoid(8),
          label: btn.label || '',
          url: btn.url || '',
          iconSlug: btn.iconSlug,
          iconSvg: btn.iconSvg,
          iconBrandColor: btn.iconBrandColor,
          icon: btn.icon,
        })),
    };
  }

  #applyLinkUpdates(link, payload) {
    const fields = ['title', 'url', 'description', 'favicon', 'faviconDark',
      'platforms', 'imageGallery', 'detailDescription', 'customButtons', 'iconScale'];
    for (const f of fields) {
      if (payload[f] === undefined) continue;
      if (f === 'imageGallery') {
        link[f] = (payload[f] || []).filter(img => img && img.trim());
      } else if (f === 'platforms') {
        link[f] = payload[f] || [];
      } else if (f === 'customButtons') {
        link[f] = payload[f]
          .filter(btn => (btn.label || btn.iconSvg || btn.icon) && btn.url)
          .map(btn => ({
            id: btn.id || 'btn_' + nanoid(8),
            label: btn.label || '',
            url: btn.url || '',
            iconSlug: btn.iconSlug,
            iconSvg: btn.iconSvg,
            iconBrandColor: btn.iconBrandColor,
            icon: btn.icon,
          }));
      } else if (f === 'iconScale') {
        link[f] = Math.min(200, Math.max(50, Number(payload[f]) || 100));
      } else if (f === 'faviconDark') {
        link[f] = payload[f] || '';
      } else {
        link[f] = payload[f];
      }
    }
  }

  createLink(catId, subId, payload) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return null;
    const sub = (cat.subCategories || []).find(s => s.id === subId);
    if (!sub) return null;
    const link = this.#sanitizeLinkPayload(payload);
    link.order = sub.links.length;
    sub.links.push(link);
    this.#writeData(data);
    return link;
  }

  updateLink(catId, subId, linkId, payload) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return null;
    const sub = (cat.subCategories || []).find(s => s.id === subId);
    if (!sub) return null;
    const link = sub.links.find(l => l.id === linkId);
    if (!link) return null;
    this.#applyLinkUpdates(link, payload);
    this.#writeData(data);
    return link;
  }

  moveLink(linkId, fromCatId, fromSubId, toCatId, toSubId, linkData) {
    const data = this.#readData();
    const fromCat = data.categories.find(c => c.id === fromCatId);
    if (!fromCat) return null;
    const fromSub = (fromCat.subCategories || []).find(s => s.id === fromSubId);
    if (!fromSub) return null;
    const idx = fromSub.links.findIndex(l => l.id === linkId);
    if (idx === -1) return null;
    const [link] = fromSub.links.splice(idx, 1);
    fromSub.links.forEach((l, i) => (l.order = i));
    if (linkData) this.#applyLinkUpdates(link, linkData);
    const toCat = data.categories.find(c => c.id === toCatId);
    if (!toCat) return null;
    const toSub = (toCat.subCategories || []).find(s => s.id === toSubId);
    if (!toSub) return null;
    link.order = toSub.links.length;
    toSub.links.push(link);
    this.#writeData(data);
    return link;
  }

  deleteLink(catId, subId, linkId) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return false;
    const sub = (cat.subCategories || []).find(s => s.id === subId);
    if (!sub) return false;
    const idx = sub.links.findIndex(l => l.id === linkId);
    if (idx === -1) return false;
    sub.links.splice(idx, 1);
    sub.links.forEach((l, i) => (l.order = i));
    this.#writeData(data);
    return true;
  }

  reorderLinks(catId, subId, orderedIds) {
    const data = this.#readData();
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return;
    const sub = (cat.subCategories || []).find(s => s.id === subId);
    if (!sub || !sub.links) return;
    const map = new Map(sub.links.map(l => [l.id, l]));
    orderedIds.forEach((id, index) => {
      const link = map.get(id);
      if (link) link.order = index;
    });
    sub.links.sort((a, b) => a.order - b.order);
    this.#writeData(data);
  }

  // ---------- public: Settings ----------

  static DEFAULT_SETTINGS = {
    title: 'My Nav 的主页',
    logoUrl: '',
    githubJsdelivr: false,
    localIcons: true,
    localGallery: false,
    galleryAutoPlay: true,
    galleryAutoPlayInterval: 5000,
    galleryTransition: 'fade',
    galleryMasonryAutoScroll: true,
    galleryMasonryScrollSpeed: 20,
    galleryDefaultMode: 'carousel',
    galleryCarouselTimeout: 10000,
  };

  getSettings() {
    const data = this.#readData();
    return { ...DataStore.DEFAULT_SETTINGS, ...data.siteSettings };
  }

  updateSettings(payload) {
    const data = this.#readData();
    if (!data.siteSettings) data.siteSettings = { ...DataStore.DEFAULT_SETTINGS };
    const s = data.siteSettings;
    const fields = ['title', 'logoUrl', 'githubJsdelivr', 'localIcons', 'localGallery', 'galleryAutoPlay',
      'galleryAutoPlayInterval', 'galleryTransition', 'galleryMasonryAutoScroll',
      'galleryMasonryScrollSpeed', 'galleryDefaultMode', 'galleryCarouselTimeout'];
    for (const f of fields) {
      if (payload[f] !== undefined) {
        if (f === 'galleryAutoPlayInterval' || f === 'galleryMasonryScrollSpeed' || f === 'galleryCarouselTimeout') {
          s[f] = Number(payload[f]) || 0;
        } else if (f === 'githubJsdelivr' || f === 'localIcons' || f === 'localGallery' || f === 'galleryAutoPlay' || f === 'galleryMasonryAutoScroll') {
          s[f] = !!payload[f];
        } else {
          s[f] = payload[f];
        }
      }
    }
    this.#writeData(data);
    return { ...DataStore.DEFAULT_SETTINGS, ...s };
  }

  updateLogoUrl(logoUrl) {
    const data = this.#readData();
    if (!data.siteSettings) data.siteSettings = { ...DataStore.DEFAULT_SETTINGS };
    data.siteSettings.logoUrl = logoUrl;
    this.#writeData(data);
    return { logoUrl };
  }

  // ---------- public: Uploads ----------

  getUploadsDir() {
    return this.UPLOADS_DIR;
  }
}

module.exports = { DataStore };
