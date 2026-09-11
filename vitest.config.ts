import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // 排除嵌套 worktree（如 .claude/worktrees/*，其他并行会话的独立工作区），
    // 否则默认 include glob 会把它们的测试也扫进本次 npm test。
    // EN: Exclude nested worktrees (e.g. .claude/worktrees/*, isolated working
    // copies used by other parallel sessions) — otherwise the default include
    // glob would sweep their tests into this npm test run too.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
