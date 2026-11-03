const axios = require('axios');
const { execFileSync } = require('child_process');
const path = require('path');

const REPOSITORY = 'https://github.com/shenbourne/NookNav';
const VERSION =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

function compareVersions(left, right) {
  const a = VERSION.exec(left);
  const b = VERSION.exec(right);
  if (!a || !b) {
    return null;
  }
  for (let i = 1; i <= 3; i++) {
    if (BigInt(a[i]) !== BigInt(b[i])) {
      return BigInt(a[i]) > BigInt(b[i]) ? 1 : -1;
    }
  }
  if (!a[4] || !b[4]) {
    return a[4] === b[4] ? 0 : a[4] ? -1 : 1;
  }
  const ap = a[4].split('.');
  const bp = b[4].split('.');
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (ap[i] === bp[i]) {
      continue;
    }
    if (ap[i] === undefined) {
      return -1;
    }
    if (bp[i] === undefined) {
      return 1;
    }
    const an = /^\d+$/.test(ap[i]);
    const bn = /^\d+$/.test(bp[i]);
    if (an && bn) {
      return BigInt(ap[i]) > BigInt(bp[i]) ? 1 : -1;
    }
    if (an !== bn) {
      return an ? -1 : 1;
    }
    return ap[i] > bp[i] ? 1 : -1;
  }
  return 0;
}

function getAppInfo() {
  let version = process.env.NAV_APP_VERSION;
  if (!version) {
    try {
      version = execFileSync('git', ['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0'], {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      version = 'dev';
    }
  }
  return {
    name: 'NookNav',
    version,
    deployment: process.env.NAV_DEPLOYMENT === 'docker' ? 'docker' : 'source',
  };
}

function createUpdateChecker(fetchRelease, now = Date.now) {
  let cache;
  let expires = 0;
  let pending;
  return async function check(currentVersion) {
    if (!cache || now() >= expires) {
      if (!pending) {
        pending = (async () => {
          const release = await fetchRelease();
          if (
            release &&
            (!VERSION.test(release.tag_name) ||
              release.prerelease ||
              release.draft ||
              VERSION.exec(release.tag_name)[4])
          ) {
            throw new Error('发布版本信息无效');
          }
          cache = { release };
          expires = now() + 5 * 60 * 1000;
        })().finally(() => {
          pending = null;
        });
      }
      await pending;
    }
    const release = cache.release;
    if (!release) {
      return { status: 'unpublished' };
    }
    const comparison = compareVersions(release.tag_name, currentVersion);
    return {
      status: comparison === null ? 'unknown' : comparison > 0 ? 'available' : 'current',
      latestVersion: release.tag_name,
      releaseUrl: `${REPOSITORY}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    };
  };
}

const checkForUpdates = createUpdateChecker(async () => {
  try {
    const response = await axios.get(
      'https://api.github.com/repos/shenbourne/NookNav/releases/latest',
      {
        timeout: 8000,
        maxRedirects: 0,
        maxContentLength: 1024 * 1024,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NookNav-update-check' },
      }
    );
    if (!response.data || typeof response.data !== 'object') {
      throw new Error('发布版本信息无效');
    }
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
});

module.exports = { compareVersions, createUpdateChecker, getAppInfo, checkForUpdates };
