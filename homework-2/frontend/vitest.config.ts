import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Tests run in jsdom, a browser emulation inside Node: components render to a real DOM that the tests
 * query and click, without opening a browser. The Vite config (React plugin, CSS modules) is reused.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // Entry point: only wires providers into the page.
        exclude: ['src/main.tsx'],
        reporter: ['text', 'html', 'json-summary'],
        thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
      },
    },
  }),
);
