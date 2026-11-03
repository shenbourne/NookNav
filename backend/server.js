const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { fetchMeta, matchIconsFromSource, searchDashboardIcons, searchLobeIcons } = require('./services/meta-fetcher');
const { DataStore } = require('./services/data-store');
const { ImageStorage } = require('./services/image-storage');
const {
  UnsafeUrlError,
  createRateLimiter,
  validatePassword,
  detectImageType,
  signSessionToken,
  verifySessionToken,
} = require('./services/security');

const { getAppInfo, checkForUpdates } = require('./services/app-info');
const appInfo = getAppInfo();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// NAV_DATA_DIR 允许把数据目录放到仓库之外（测试 / 自定义部署时使用）
const DATA_DIR = process.env.NAV_DATA_DIR
  ? path.resolve(process.env.NAV_DATA_DIR)
  : path.join(__dirname, 'data');
const SAFE_LOGO_PATTERN = /^\/logo\.(png|jpe?g|gif|webp)$/i;
const SAFE_IMAGE_PATTERN = /^\/(icons|gallery)\/[a-f0-9]{64}\.webp$/;

const store = new DataStore(DATA_DIR);
const imageStorage = new ImageStorage(store);
imageStorage.start();

if (!fs.existsSync(store.getUploadsDir())) {
  fs.mkdirSync(store.getUploadsDir(), { recursive: true });
}

// 清理旧版本可能残留的活动内容文件（.svg / .html 等）
for (const name of fs.readdirSync(store.getUploadsDir())) {
  if (name.startsWith('logo.') && !/^logo\.(png|jpe?g|gif|webp)$/i.test(name)) {
    try {
      fs.unlinkSync(path.join(store.getUploadsDir(), name));
      console.warn(`[upload] 已删除不安全的旧文件：${name}`);
    } catch (err) {
      console.warn(`[upload] 无法删除旧文件 ${name}: ${err.message}`);
    }
  }
}

// 位于反向代理之后时，用 TRUST_PROXY 指定可信层数，否则不信任 X-Forwarded-For
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value);
}

// --- Request logging middleware ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Logo 上传：先读入内存，按文件头识别真实类型后再落盘，
// 文件名由服务端决定，客户端扩展名不参与任何路径或类型决策。
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  },
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }, // 2MB
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 上传目录只允许安全的位图文件，禁止执行任何主动内容
app.use(
  '/uploads',
  (req, res, next) => {
    if (!SAFE_LOGO_PATTERN.test(req.path) && !SAFE_IMAGE_PATTERN.test(req.path)) {
      return res.status(404).end();
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  },
  express.static(store.getUploadsDir(), {
    dotfiles: 'deny',
    index: false,
    fallthrough: false,
    setHeaders(res) {
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

// --- Health check endpoint ---
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// --- Auth middleware ---

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未授权，请先登录' });
  }

  const token = authHeader.split(' ')[1];
  const authConfig = store.getAuthConfig();

  try {
    // 固定 HS256、绑定账号名与令牌版本；改密/改名会让旧令牌立即失效。
    const decoded = verifySessionToken(token, authConfig);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginIpLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  max: 20,
  message: '登录尝试过于频繁',
});
const loginAccountLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  max: 10,
  message: '该账号尝试次数过多',
  keyFn: req => `user:${String(req.body?.username || '').toLowerCase()}`,
});
const credentialLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  max: 10,
  message: '验证失败次数过多',
  keyFn: req => `credential:${req.user?.username || 'unknown'}`,
});

// --- Auth routes ---

app.post('/api/auth/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const authConfig = store.getAuthConfig();

    // 无论用户名是否正确都执行一次哈希比较，避免通过响应时间枚举账号。
    const isMatch = await bcrypt.compare(String(password ?? ''), authConfig.password);
    if (username !== authConfig.username || !isMatch) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    // Successful logins should not consume the brute-force budget.
    loginIpLimiter.reset(req);
    loginAccountLimiter.reset(req);
    const token = signSessionToken(authConfig);
    res.json({ success: true, data: { token, username } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/check', authMiddleware, (req, res) => {
  res.json({ success: true, data: { username: req.user.username } });
});

app.put('/api/auth/password', authMiddleware, credentialLimiter, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    const authConfig = store.getAuthConfig();

    const isMatch = await bcrypt.compare(String(oldPassword ?? ''), authConfig.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: '当前密码错误' });
    }

    const policyError = validatePassword(newPassword, { username: authConfig.username });
    if (policyError) {
      return res.status(400).json({ success: false, error: policyError });
    }
    if (await bcrypt.compare(newPassword, authConfig.password)) {
      return res.status(400).json({ success: false, error: '新密码不能与当前密码相同' });
    }

    const updatedConfig = store.updateAuthConfig({
      password: await bcrypt.hash(newPassword, 10),
      tokenVersion: (Number(authConfig.tokenVersion) || 1) + 1,
    });
    credentialLimiter.reset(req);
    // 轮换版本后旧令牌全部失效，返回新令牌以保持当前会话可用。
    res.json({ success: true, data: { token: signSessionToken(updatedConfig) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/auth/username', authMiddleware, credentialLimiter, async (req, res) => {
  try {
    const { newUsername, password } = req.body || {};
    if (typeof newUsername !== 'string' || newUsername.trim().length < 2) {
      return res.status(400).json({ success: false, error: '用户名至少需要2个字符' });
    }
    if (newUsername.trim().length > 32) {
      return res.status(400).json({ success: false, error: '用户名不能超过32个字符' });
    }

    const authConfig = store.getAuthConfig();
    const isMatch = await bcrypt.compare(String(password ?? ''), authConfig.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: '密码验证失败' });
    }

    const updatedConfig = store.updateAuthConfig({
      username: newUsername.trim(),
      tokenVersion: (Number(authConfig.tokenVersion) || 1) + 1,
    });
    credentialLimiter.reset(req);
    res.json({
      success: true,
      data: { username: updatedConfig.username, token: signSessionToken(updatedConfig) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Category routes ---

app.get('/api/categories', (req, res) => {
  try {
    const categories = store.getDisplayCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Reorder routes (must be BEFORE parameterized routes) ---

app.put('/api/categories/reorder', authMiddleware, (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    store.reorderCategories(orderedIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/categories/:catId/subcategories/reorder', authMiddleware, (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    store.reorderSubCategories(req.params.catId, orderedIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/categories/:catId/subcategories/:subId/links/reorder', authMiddleware, (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    store.reorderLinks(req.params.catId, req.params.subId, orderedIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Category CRUD ---

app.post('/api/categories', authMiddleware, (req, res) => {
  try {
    const { name, icon } = req.body;
    const cat = store.createCategory({ name, icon });
    res.json({ success: true, data: store.projectCategory(cat) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/categories/:catId', authMiddleware, (req, res) => {
  try {
    const cat = store.updateCategory(req.params.catId, { name: req.body.name, icon: req.body.icon });
    if (!cat) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, data: store.projectCategory(cat) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/categories/:catId', authMiddleware, (req, res) => {
  try {
    const ok = store.deleteCategory(req.params.catId);
    if (!ok) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- SubCategory CRUD ---

app.post('/api/categories/:catId/subcategories', authMiddleware, (req, res) => {
  try {
    const { name, color } = req.body;
    const sub = store.createSubCategory(req.params.catId, { name, color });
    if (!sub) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, data: store.projectSubCategory(sub) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/categories/:catId/subcategories/:subId', authMiddleware, (req, res) => {
  try {
    const { name, color } = req.body;
    const sub = store.updateSubCategory(req.params.catId, req.params.subId, { name, color });
    if (!sub) return res.status(404).json({ success: false, error: 'Sub-category not found' });
    res.json({ success: true, data: store.projectSubCategory(sub) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/categories/:catId/subcategories/:subId', authMiddleware, (req, res) => {
  try {
    const ok = store.deleteSubCategory(req.params.catId, req.params.subId);
    if (!ok) return res.status(404).json({ success: false, error: 'Sub-category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/subcategories/move', authMiddleware, (req, res) => {
  try {
    const { subId, fromCatId, toCatId } = req.body;
    if (!subId || !fromCatId || !toCatId) {
      return res.status(400).json({ success: false, error: 'subId, fromCatId and toCatId are required' });
    }
    if (fromCatId === toCatId) {
      return res.status(400).json({ success: false, error: 'Source and target category cannot be the same' });
    }
    const sub = store.moveSubCategory(subId, fromCatId, toCatId);
    if (!sub) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: store.projectSubCategory(sub) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Link CRUD ---

app.post('/api/categories/:catId/subcategories/:subId/links', authMiddleware, (req, res) => {
  try {
    const link = store.createLink(req.params.catId, req.params.subId, req.body);
    if (!link) return res.status(404).json({ success: false, error: 'Category or sub-category not found' });
    imageStorage.start();
    res.json({ success: true, data: store.projectLink(link) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/categories/:catId/subcategories/:subId/links/:linkId', authMiddleware, (req, res) => {
  try {
    const link = store.updateLink(req.params.catId, req.params.subId, req.params.linkId, req.body);
    if (!link) return res.status(404).json({ success: false, error: 'Link not found' });
    imageStorage.start();
    res.json({ success: true, data: store.projectLink(link) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/links/move', authMiddleware, (req, res) => {
  try {
    const { linkId, fromCatId, fromSubId, toCatId, toSubId, data: linkData } = req.body;
    const link = store.moveLink(linkId, fromCatId, fromSubId, toCatId, toSubId, linkData);
    if (!link) return res.status(404).json({ success: false, error: 'Not found' });
    imageStorage.start();
    res.json({ success: true, data: store.projectLink(link) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/categories/:catId/subcategories/:subId/links/:linkId', authMiddleware, (req, res) => {
  try {
    const ok = store.deleteLink(req.params.catId, req.params.subId, req.params.linkId);
    if (!ok) return res.status(404).json({ success: false, error: 'Link not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Site settings routes ---

app.get('/api/settings', (req, res) => {
  try {
    const settings = store.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/settings', authMiddleware, (req, res) => {
  try {
    const settings = store.updateSettings(req.body);
    imageStorage.start();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/settings/image-storage', authMiddleware, (req, res) => {
  try {
    res.json({ success: true, data: imageStorage.status() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings/image-storage/retry', authMiddleware, (req, res) => {
  try {
    imageStorage.start({ retry: true });
    res.json({ success: true, data: imageStorage.status() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings/logo', authMiddleware, (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择一个图片文件' });
    }

    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return res.status(400).json({
        success: false,
        error: '只允许上传 PNG / JPEG / GIF / WebP 图片',
      });
    }

    try {
      const uploadsDir = store.getUploadsDir();
      const filename = `logo.${detected.ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer, { mode: 0o644 });

      // 删除其它旧 logo 文件，避免历史活动内容继续留在目录里
      const oldFiles = fs.readdirSync(uploadsDir).filter(f => f.startsWith('logo.') && f !== filename);
      oldFiles.forEach(f => fs.unlinkSync(path.join(uploadsDir, f)));

      const result = store.updateLogoUrl(`/uploads/${filename}?v=${Date.now()}`);
      res.json({ success: true, data: result });
    } catch (writeErr) {
      res.status(500).json({ success: false, error: writeErr.message });
    }
  });
});

// --- Meta fetch route ---

app.post('/api/fetch-meta', authMiddleware, async (req, res) => {
  try {
    const { url, skipIconSource } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
    const meta = await fetchMeta(url, { skipIconSource });
    res.json({ success: true, data: meta });
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return res.status(400).json({ success: false, error: err.message });
    }
    res.status(502).json({ success: false, error: `抓取失败：${err.message}` });
  }
});

// Application identity and explicit, authenticated release checks.
app.get('/api/app-info', authMiddleware, (req, res) => {
  res.json({ success: true, data: appInfo });
});
app.get('/api/app-info/updates', authMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await checkForUpdates(appInfo.version) });
  } catch {
    res.status(502).json({ success: false, error: '无法检查更新，请稍后重试（网络异常或 GitHub 请求受限）' });
  }
});

// --- Icon matching routes ---

app.post('/api/match-icons', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
    const matchedIcons = await matchIconsFromSource(url, { forceRefresh: true });
    res.json({ success: true, data: matchedIcons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/search-dashboard-icons', authMiddleware, async (req, res) => {
  try {
    const { query, limit } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    const icons = await searchDashboardIcons(query, { limit: limit || 20 });
    res.json({ success: true, data: icons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/search-lobe-icons', authMiddleware, async (req, res) => {
  try {
    const { query, limit } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    const icons = await searchLobeIcons(query, { limit: limit || 20 });
    res.json({ success: true, data: icons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Serve frontend static files in production ---
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NookNav backend running on http://localhost:${PORT}`);
  });
}

module.exports = { app, store, imageStorage };
