import { IMPORT_FILE_LIMIT } from '../../packages/core/src/limits.ts';

export default {
  // Include multipart framing so Next's proxy does not truncate valid uploads.
  experimental: { proxyClientMaxBodySize: IMPORT_FILE_LIMIT + 1_000_000 },
  serverExternalPackages: ['better-sqlite3', '@gbook/core', '@gbook/auth'],
  outputFileTracingExcludes: { '/*': ['../../.phase0/**/*', '../../.test-data/**/*'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
};
