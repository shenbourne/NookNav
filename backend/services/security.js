/**
 * 安全工具集：外发请求地址校验（防 SSRF）、登录限流、密码策略、上传类型识别。
 *
 * 这里的每个函数都是「唯一入口」型校验：路由层只允许通过这些函数处理
 * 不可信输入，避免同一规则在多处实现时出现绕过。
 */
const dns = require('dns');
const net = require('net');
const axios = require('axios');
const jwt = require('jsonwebtoken');

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
]);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

// ---------- IP 分类 ----------

function isBlockedIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // deprecated 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

function isBlockedIPv6(rawIp) {
  const ip = rawIp.toLowerCase().split('%')[0];
  if (ip === '::' || ip === '::1') return true;

  const segments = parseIPv6Segments(ip);
  if (!segments) return true;

  const first = segments[0];
  const second = segments[1];
  if ((first & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && second === 0x0db8) return true; // documentation
  if (first === 0x2001 && second === 0) return true; // Teredo
  if (first === 0x2002) {
    // 6to4 embeds an IPv4 address in the next two groups.
    return isBlockedIPv4(ipv4FromGroups(segments[1], segments[2]));
  }

  // IPv4-compatible (::/96) is deprecated and must not be used to smuggle
  // loopback/private IPv4 destinations past an IPv6 check.
  if (segments.slice(0, 6).every(part => part === 0)) return true;

  // IPv4-mapped ::ffff/96 and IPv4-translated ::ffff:0:0/96.
  if (segments.slice(0, 5).every(part => part === 0) && segments[5] === 0xffff) {
    return isBlockedIPv4(ipv4FromGroups(segments[6], segments[7]));
  }
  if (
    segments.slice(0, 4).every(part => part === 0)
    && segments[4] === 0xffff
    && segments[5] === 0
  ) {
    return isBlockedIPv4(ipv4FromGroups(segments[6], segments[7]));
  }

  // Well-known NAT64 prefix 64:ff9b::/96.
  if (
    first === 0x0064
    && second === 0xff9b
    && segments[2] === 1
  ) {
    return true; // local-use NAT64 prefix 64:ff9b:1::/48
  }
  if (
    first === 0x0064
    && second === 0xff9b
    && segments.slice(2, 6).every(part => part === 0)
  ) {
    return isBlockedIPv4(ipv4FromGroups(segments[6], segments[7]));
  }

  return false;
}

function parseIPv6Segments(input) {
  let ip = input;
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[1])) return null;
    const octets = dotted[1].split('.').map(Number);
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    ip = ip.slice(0, -dotted[1].length) + `${hi}:${lo}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;

  const parts = [
    ...head,
    ...Array.from({ length: missing }, () => '0'),
    ...tail,
  ];
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }
  return parts.map(part => parseInt(part, 16));
}

function ipv4FromGroups(high, low) {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicAddress(ip) {
  if (net.isIPv4(ip)) return !isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return !isBlockedIPv6(ip);
  return false;
}

// ---------- URL 校验 ----------

/**
 * 解析并校验一个用户提供的 URL，返回解析结果和已校验的 IP 列表。
 * 域名会先做 DNS 解析，所有解析结果都必须是公网地址。
 */
async function resolveSafeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new UnsafeUrlError('URL 不能为空');
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new UnsafeUrlError('URL 格式无效');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError('只允许 http 或 https 地址');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('URL 不能包含账号密码');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!hostname) {
    throw new UnsafeUrlError('URL 缺少主机名');
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some(s => hostname.endsWith(s))) {
    throw new UnsafeUrlError('禁止访问本机或内网地址');
  }

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  } else {
    try {
      addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new UnsafeUrlError('无法解析该域名');
    }
  }

  if (!addresses.length) {
    throw new UnsafeUrlError('无法解析该域名');
  }
  for (const entry of addresses) {
    if (!isPublicAddress(entry.address)) {
      throw new UnsafeUrlError('禁止访问内网或保留地址');
    }
  }

  // Prefer IPv4 when available: some container hosts can resolve AAAA records
  // but have no working IPv6 route.
  const preferred = addresses.find(entry => entry.family === 4) || addresses[0];
  return { url, address: preferred.address, family: preferred.family };
}

/**
 * 带 SSRF 防护的 GET 请求。
 *
 * - 每次请求（包括重定向目标）都重新做地址校验；
 * - 用 lookup 钩子把连接固定在校验过的 IP 上，避免 DNS rebinding；
 * - 手动跟随重定向，最多 maxRedirects 次。
 */
async function safeGet(rawUrl, {
  timeout = 8000, headers = {}, maxRedirects = 5,
  responseType = 'text', maxContentLength = 2 * 1024 * 1024,
  allowedContentTypes = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml)/,
} = {}) {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, address, family } = await resolveSafeUrl(currentUrl);

    const response = await axios.get(url.href, {
      timeout,
      headers,
      responseType,
      maxContentLength,
      maxRedirects: 0,
      proxy: false,
      validateStatus: () => true,
      lookup: (hostname, options, callback) => {
        if (options?.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    });

    const location = response.headers?.location;
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, url).href;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      const err = new Error(`目标站点返回 ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    if (
      contentType
      && !allowedContentTypes.test(contentType)
    ) {
      throw new UnsafeUrlError(responseType === 'text' ? '目标地址不是可解析的网页' : '目标地址不是图片');
    }
    return response;
  }

  throw new UnsafeUrlError('重定向次数过多');
}

// ---------- 登录限流 ----------

/**
 * 进程内滑动窗口限流。单实例部署足够；多实例部署应换成共享存储实现。
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = '尝试次数过多，请稍后再试',
  keyFn = req => req.ip || req.socket?.remoteAddress || 'unknown',
} = {}) {
  const buckets = new Map();
  let callsSinceSweep = 0;

  function sweep(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  const rateLimiter = function rateLimiter(req, res, next) {
    const now = Date.now();
    callsSinceSweep += 1;
    if (callsSinceSweep >= 200) {
      sweep(now);
      callsSinceSweep = 0;
    }

    const key = keyFn(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: `${message}（${retryAfter} 秒后可重试）`,
      });
    }
    next();
  };

  rateLimiter.reset = req => {
    buckets.delete(keyFn(req));
  };
  return rateLimiter;
}

// ---------- 会话令牌 ----------

/**
 * 签发会话令牌。令牌同时绑定账号名和令牌版本。
 */
function signSessionToken(authConfig) {
  return jwt.sign(
    { username: authConfig.username, tv: Number(authConfig.tokenVersion) || 1 },
    authConfig.jwtSecret,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}

/**
 * 校会话令牌：固定算法、校验账号与令牌版本。
 * 任何一项不匹配都抛出异常，由调用方统一返回 401。
 */
function verifySessionToken(token, authConfig) {
  const decoded = jwt.verify(token, authConfig.jwtSecret, { algorithms: ['HS256'] });
  const expectedVersion = Number(authConfig.tokenVersion) || 1;
  if (decoded.username !== authConfig.username) {
    throw new Error('令牌主体与当前账号不一致');
  }
  if (Number(decoded.tv) !== expectedVersion) {
    throw new Error('令牌版本已失效');
  }
  return decoded;
}

// ---------- 密码策略 ----------

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt 只处理前 72 字节
const COMMON_PASSWORDS = new Set([
  'admin123',
  'admin123456',
  'password',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'qwerty123',
  'letmein',
  'welcome',
]);

/**
 * 校验新密码。返回错误提示字符串；通过时返回 null。
 */
function validatePassword(password, { username = '' } = {}) {
  if (typeof password !== 'string') {
    return '密码必须是字符串';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return '该密码过于常见，请更换更复杂的密码';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return '密码过长（最多 72 字节）';
  }
  if (password.trim() !== password) {
    return '密码首尾不能有空格';
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return '密码不能与用户名相同';
  }
  return null;
}

// ---------- 上传类型识别 ----------

const IMAGE_SIGNATURES = [
  {
    ext: 'png',
    mime: 'image/png',
    matches: buf => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    matches: buf => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    matches: buf => buf.length >= 6 && buf.subarray(0, 4).toString('ascii') === 'GIF8',
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    matches: buf => buf.length >= 12
      && buf.subarray(0, 4).toString('ascii') === 'RIFF'
      && buf.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/**
 * 根据文件头判断真实图片类型。无法识别时返回 null。
 */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const match = IMAGE_SIGNATURES.find(sig => sig.matches(buffer));
  return match ? { ext: match.ext, mime: match.mime } : null;
}

module.exports = {
  UnsafeUrlError,
  isPublicAddress,
  resolveSafeUrl,
  safeGet,
  createRateLimiter,
  signSessionToken,
  verifySessionToken,
  validatePassword,
  detectImageType,
  MIN_PASSWORD_LENGTH,
};
