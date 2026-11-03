const axios = require('axios');
const cheerio = require('cheerio');
const { safeGet, resolveSafeUrl, UnsafeUrlError } = require('./security');

// 图标源配置
const ICON_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/shenbourne/Image-Hosting-Service@main/icons';
const ICON_LIST_URL = `${ICON_SOURCE_URL}/.list.txt`;

// 缓存图标列表
let iconListCache = null;
let iconListCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 获取图标列表
async function getIconList(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && iconListCache && (now - iconListCacheTime) < CACHE_TTL) {
    return iconListCache;
  }

  try {
    const { data } = await axios.get(ICON_LIST_URL, { timeout: 5000 });
    iconListCache = data.split('\n').filter(line => line.trim() && line.endsWith('.png'));
    iconListCacheTime = now;
    return iconListCache;
  } catch {
    return iconListCache || [];
  }
}

// 从 URL 提取所有待匹配的关键词（hostname + 路径片段）
function extractKeywords(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    // 如果直接传入的是 hostname，则当作 hostname 处理
    return [cleanHostname(url)];
  }

  const keywords = new Set();

  // 1. hostname 关键词
  const hostKw = cleanHostname(parsedUrl.hostname);
  if (hostKw) keywords.add(hostKw);

  // 2. 路径片段关键词（按 / 分割，过滤空串）
  const pathParts = parsedUrl.pathname
    .toLowerCase()
    .split('/')
    .map(p => p.trim())
    .filter(p => p.length > 1);

  for (const part of pathParts) {
    // 将 kebab-case / camelCase / PascalCase 拆开
    const subParts = part.split(/[-_.]/).filter(s => s.length > 1);
    for (const sp of subParts) {
      keywords.add(sp);
    }
    keywords.add(part);
  }

  return [...keywords];
}

function cleanHostname(hostname) {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.com$|\.cn$|\.org$|\.net$|\.io$|\.co\.\w+$/, '')
    .replace(/\./g, '');
}

// 模糊匹配图标 - 返回所有匹配的图标（按相似度排序）
async function matchIconsFromSource(urlOrHostname, { forceRefresh = false } = {}) {
  const icons = await getIconList(forceRefresh);
  if (!icons.length) return [];

  const keywords = extractKeywords(urlOrHostname);

  // iconUrl -> 最高分记录
  const bestMatchMap = new Map();

  for (const keyword of keywords) {
    for (const icon of icons) {
      const iconName = icon.toLowerCase().replace('.png', '');
      const iconUrl = `${ICON_SOURCE_URL}/${icon}`;

      let score = 0;
      let type = 'fuzzy';

      // 完全匹配
      if (iconName === keyword) {
        score = 1.0;
        type = 'exact';
      }
      // 包含关系匹配
      else if (iconName.includes(keyword) || keyword.includes(iconName)) {
        score = calculateSimilarity(keyword, iconName);
        type = score >= 0.9 ? 'exact' : 'contains';
        if (score <= 0.6) continue;
      }
      // 模糊匹配
      else {
        score = calculateSimilarity(keyword, iconName);
        if (score <= 0.5) continue;
        type = 'fuzzy';
      }

      const existing = bestMatchMap.get(iconUrl);
      if (!existing || score > existing.score) {
        bestMatchMap.set(iconUrl, { icon: iconUrl, score, type });
      }
    }
  }

  const matches = [...bestMatchMap.values()];

  // 按相似度降序排序
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, 10); // 最多返回 10 个匹配结果
}

// 简单相似度计算
function calculateSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

async function fetchMeta(url, options = {}) {
  const result = { title: '', description: '', favicon: '' };
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    return result;
  }

  // 用户提供的地址必须先通过 SSRF 校验；不安全的地址直接拒绝，不做降级处理。
  await resolveSafeUrl(url);

  // 优先使用图标源匹配（除非指定了 skipIconSource）
  if (!options.skipIconSource) {
    const matchedIcons = await matchIconsFromSource(url);
    if (matchedIcons.length > 0) {
      result.favicon = matchedIcons[0].icon; // 默认使用最佳匹配
      result.matchedIcons = matchedIcons; // 返回所有匹配结果供用户选择
    }
  }

  try {
    const { data: html } = await safeGet(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
    });

    const $ = cheerio.load(html);

    // Title
    result.title =
      $('title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('meta[name="twitter:title"]').attr('content')?.trim() ||
      '';

    // Description
    result.description =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('meta[name="twitter:description"]').attr('content')?.trim() ||
      '';

    // Favicon - try multiple sources (如果图标源未匹配到)
    if (!result.favicon) {
      const iconSelectors = [
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
        'link[rel="apple-touch-icon-precomposed"]',
      ];

      let faviconHref = '';
      for (const sel of iconSelectors) {
        const href = $(sel).attr('href');
        if (href) {
          faviconHref = href;
          break;
        }
      }

      if (faviconHref) {
        // Resolve relative URL to absolute
        try {
          result.favicon = new URL(faviconHref, parsedUrl.origin).href;
        } catch {
          result.favicon = faviconHref;
        }
      } else {
        // Fallback: try /favicon.ico directly
        result.favicon = `${parsedUrl.origin}/favicon.ico`;
      }
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    // If fetch fails, use domain name as title
    result.title = parsedUrl.hostname;
    // 如果图标源未匹配到，使用 Google favicon API
    if (!result.favicon) {
      result.favicon = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
    }
  }

  // Final fallback for favicon (如果图标源和网页抓取都未获取到)
  if (!result.favicon) {
    result.favicon = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
  }

  // Fallback title to hostname
  if (!result.title) {
    result.title = parsedUrl.hostname;
  }

  return result;
}

// ========== Dashboard Icons 支持 ==========

// Dashboard Icons 配置
const DASHBOARD_ICONS_BASE_URL = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const DASHBOARD_ICONS_METADATA_URL = `${DASHBOARD_ICONS_BASE_URL}/metadata.json`;

// 缓存 Dashboard Icons metadata
let dashboardIconsMetadataCache = null;
let dashboardIconsMetadataCacheTime = 0;
const DASHBOARD_ICONS_CACHE_TTL = 60 * 60 * 1000; // 1小时缓存

/**
 * 获取 Dashboard Icons 的 metadata
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Promise<Object>} 图标元数据对象（key-value 结构）
 */
async function getDashboardIconsMetadata(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && dashboardIconsMetadataCache && (now - dashboardIconsMetadataCacheTime) < DASHBOARD_ICONS_CACHE_TTL) {
    return dashboardIconsMetadataCache;
  }

  try {
    const { data } = await axios.get(DASHBOARD_ICONS_METADATA_URL, { timeout: 15000 });
    // metadata.json 是一个对象，键是图标名称
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      dashboardIconsMetadataCache = data;
      dashboardIconsMetadataCacheTime = now;
      return data;
    }
    return dashboardIconsMetadataCache || {};
  } catch (err) {
    console.error('获取 Dashboard Icons metadata 失败:', err.message);
    return dashboardIconsMetadataCache || {};
  }
}

/**
 * 搜索 Dashboard Icons
 * @param {string} query - 搜索关键词
 * @param {Object} options - 搜索选项
 * @param {number} options.limit - 返回结果数量限制（默认20）
 * @returns {Promise<Array>} 匹配的图标列表
 */
async function searchDashboardIcons(query, { limit = 20 } = {}) {
  if (!query || !query.trim()) return [];
  
  const metadata = await getDashboardIconsMetadata();
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  const iconNames = Object.keys(metadata);
  
  const matches = iconNames
    .filter(name => {
      const icon = metadata[name];
      const nameMatch = name.toLowerCase().includes(searchTerm);
      const aliasesMatch = icon.aliases?.some(alias => 
        alias.toLowerCase().includes(searchTerm)
      );
      return nameMatch || aliasesMatch;
    })
    .slice(0, limit)
    .map(name => {
      const icon = metadata[name];
      const baseName = name;
      
      // 检查是否有变体（通过 colors 字段）
      const hasLightVariant = !!icon.colors?.light;
      const hasDarkVariant = !!icon.colors?.dark;
      const hasVariants = hasLightVariant || hasDarkVariant;
      
      return {
        name: baseName,
        url: `${DASHBOARD_ICONS_BASE_URL}/svg/${baseName}.svg`,
        pngUrl: `${DASHBOARD_ICONS_BASE_URL}/png/${baseName}.png`,
        webpUrl: `${DASHBOARD_ICONS_BASE_URL}/webp/${baseName}.webp`,
        // colors 字段定义的变体关系（如 github: { dark: 'github', light: 'github-light' }）
        colors: icon.colors || null,
        // 兼容性：是否有变体
        hasVariants,
        // 别名信息，用于搜索提示
        aliases: icon.aliases || [],
      };
    });

  return matches;
}

// ========== LobeHub Icons 支持 ==========

const LOBEICONS_BASE_URL = 'https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages';

// 缓存 LobeHub Icons 列表
let lobeIconsCache = null;
let lobeIconsCacheTime = 0;
const LOBEICONS_CACHE_TTL = 60 * 60 * 1000; // 1小时缓存

/**
 * 获取 LobeHub Icons 列表（带重试）
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @param {number} retries - 重试次数
 * @returns {Promise<Array>} 图标名称数组
 */
async function getLobeIconsList(forceRefresh = false, retries = 2) {
  const now = Date.now();
  if (!forceRefresh && lobeIconsCache && (now - lobeIconsCacheTime) < LOBEICONS_CACHE_TTL) {
    return lobeIconsCache;
  }

  try {
    // 尝试通过 jsDelivr 的 GitHub 文件列表（更快，但有限制）
    // 或者使用 GitHub API
    const { data } = await axios.get(
      'https://api.github.com/repos/lobehub/lobe-icons/contents/packages/static-png/light',
      { 
        timeout: 30000,  // 增加超时到 30 秒
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'nooknav-icon-fetcher'
        }
      }
    );
    
    // 提取图标名称（去掉 .png 后缀）
    lobeIconsCache = data
      .filter(file => file.name.endsWith('.png'))
      .map(file => file.name.replace('.png', ''));
    
    lobeIconsCacheTime = now;
    console.log(`[LobeHub Icons] 获取到 ${lobeIconsCache.length} 个图标`);
    return lobeIconsCache;
  } catch (err) {
    console.error('获取 LobeHub Icons 列表失败:', err.message);
    
    // 如果有缓存，即使过期也返回
    if (lobeIconsCache && lobeIconsCache.length > 0) {
      console.log('[LobeHub Icons] 使用过期的缓存数据');
      return lobeIconsCache;
    }
    
    // 重试
    if (retries > 0) {
      console.log(`[LobeHub Icons] 将在 1 秒后重试... (剩余 ${retries} 次)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getLobeIconsList(forceRefresh, retries - 1);
    }
    
    return [];
  }
}

/**
 * 搜索 LobeHub Icons
 * @param {string} query - 搜索关键词
 * @param {Object} options - 搜索选项
 * @param {number} options.limit - 返回结果数量限制（默认20）
 * @returns {Promise<Array>} 匹配的图标列表
 */
async function searchLobeIcons(query, { limit = 20 } = {}) {
  if (!query || !query.trim()) return [];
  
  const icons = await getLobeIconsList();
  if (!icons || icons.length === 0) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  
  const matches = icons
    .filter(name => name.toLowerCase().includes(searchTerm))
    .slice(0, limit)
    .map(name => {
      return {
        name: name,
        light: `${LOBEICONS_BASE_URL}/static-png/light/${name}.png`,
        dark: `${LOBEICONS_BASE_URL}/static-png/dark/${name}.png`,
        svgLight: `${LOBEICONS_BASE_URL}/static-svg/light/${name}.svg`,
        svgDark: `${LOBEICONS_BASE_URL}/static-svg/dark/${name}.svg`,
        source: 'lobehub'
      };
    });

  return matches;
}

module.exports = { fetchMeta, matchIconsFromSource, searchDashboardIcons, searchLobeIcons };
