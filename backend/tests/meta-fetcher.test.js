import { describe, it, expect } from 'vitest';

// Test the pure utility functions from meta-fetcher
// We test the internal logic by re-implementing the functions here
// since they are not exported individually

function cleanHostname(hostname) {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.com$|\.cn$|\.org$|\.net$|\.io$|\.co\.\w+$/, '')
    .replace(/\./g, '');
}

function extractKeywords(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return [cleanHostname(url)];
  }

  const keywords = new Set();
  const hostKw = cleanHostname(parsedUrl.hostname);
  if (hostKw) keywords.add(hostKw);

  const pathParts = parsedUrl.pathname
    .toLowerCase()
    .split('/')
    .map(p => p.trim())
    .filter(p => p.length > 1);

  for (const part of pathParts) {
    const subParts = part.split(/[-_.]/).filter(s => s.length > 1);
    for (const sp of subParts) {
      keywords.add(sp);
    }
    keywords.add(part);
  }

  return [...keywords];
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

function calculateSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

describe('meta-fetcher utilities', () => {
  describe('cleanHostname', () => {
    it('should strip www and TLD', () => {
      expect(cleanHostname('www.google.com')).toBe('google');
      expect(cleanHostname('github.com')).toBe('github');
      expect(cleanHostname('api.example.io')).toBe('apiexample');
    });

    it('should handle hostname without TLD', () => {
      expect(cleanHostname('localhost')).toBe('localhost');
    });
  });

  describe('extractKeywords', () => {
    it('should extract hostname keyword', () => {
      const kws = extractKeywords('https://github.com');
      expect(kws).toContain('github');
    });

    it('should extract path parts', () => {
      const kws = extractKeywords('https://github.com/shenbourne/nav-site');
      expect(kws).toContain('shenbourne');
      expect(kws).toContain('nav-site');
      expect(kws).toContain('nav');
      expect(kws).toContain('site');
    });

    it('should handle plain hostname input', () => {
      const kws = extractKeywords('google');
      expect(kws).toContain('google');
    });
  });

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('github', 'github')).toBe(0);
    });

    it('should calculate correct distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(calculateSimilarity('github', 'github')).toBe(1.0);
    });

    it('should return lower score for different strings', () => {
      const sim = calculateSimilarity('github', 'gitlab');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1.0);
    });
  });
});
