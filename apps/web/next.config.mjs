import { IMPORT_FILE_LIMIT } from '../../packages/core/src/limits.ts';

export default {
  ...(process.env.GBOOK_PREVIEW_BUILD === '1' ? { distDir: '.test-data/owner-build' } : {}),
  // Include multipart framing so Next's proxy does not truncate valid uploads.
  experimental: { proxyClientMaxBodySize: IMPORT_FILE_LIMIT + 1_000_000 },
  serverExternalPackages: ['better-sqlite3', '@gbook/core', '@gbook/auth'],
  turbopack: {},
  webpack(config) {
    // Keep the native file URL when Webpack compiles the Windows auth module.
    config.module.rules.push({ test: /[\\/]dpapi\.mjs$/, parser: { url: false } });
    return config;
  },
  outputFileTracingExcludes: { '/*': ['../../.phase0/**/*', '../../.test-data/**/*'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Same-origin form navigations need a real Origin for the CSRF check.
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
};
