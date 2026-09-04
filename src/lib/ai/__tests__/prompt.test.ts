import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { ALL_CATEGORIES } from '@/lib/ai/schema';

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

describe('buildSystemPrompt', () => {
  it('注入时间基准、时区与默认币种', () => {
    const p = buildSystemPrompt(ctx);
    expect(p).toContain('2026-09-04T19:30:00+10:00');
    expect(p).toContain('Australia/Sydney');
    expect(p).toContain('AUD');
  });

  it('包含全部 17 个分类 key 的释义（§10.2a 正确性要求）', () => {
    const p = buildSystemPrompt(ctx);
    for (const key of ALL_CATEGORIES) {
      expect(p, `缺少分类释义: ${key}`).toContain(key);
    }
  });

  it('不含任何输出格式指令（§10.6 提示词纪律）', () => {
    const p = buildSystemPrompt(ctx);
    expect(p).not.toMatch(/JSON\s*数组|```|markdown|输出格式/i);
  });

  it('明确要求无账目时返回空数组', () => {
    expect(buildSystemPrompt(ctx)).toContain('空');
  });
});
