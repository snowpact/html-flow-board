import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // The fork pool can stall under sandboxed/CI environments; threads is reliable.
    pool: 'threads',
  },
});
