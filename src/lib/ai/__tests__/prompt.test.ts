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
    // 不只禁「JSON」字样——也禁复述 schema 信封与字段形状，
    // 否则「不讲输出格式」这条断言会被措辞绕过（如「返回空的 records 数组」）。
    expect(p).not.toMatch(/JSON|```|markdown|输出格式|records|字段/i);
  });

  it('明确要求无账目时返回空数组', () => {
    expect(buildSystemPrompt(ctx)).toContain('空');
  });

  it('要求"数字+描述文字"组合默认记账，即使没有货币符号/量词/动词（用户反馈原话：3 for tennis court 应该能记上，不该因为太严格而拒绝）', () => {
    expect(buildSystemPrompt(ctx)).toContain('tennis court');
  });
});
