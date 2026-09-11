import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ai/providers/cerebras', () => ({
  cerebrasStructure: vi.fn().mockResolvedValue([
    {
      type: 'EXPENSE',
      amount: 25,
      currency: null,
      date: '2026-09-04',
      category: 'FOOD',
      merchant: null,
      description: '早餐',
    },
  ]),
}));

vi.mock('@/lib/ai/providers/openrouter', () => ({
  openrouterStructure: vi.fn().mockResolvedValue([
    {
      type: 'EXPENSE',
      amount: 30,
      currency: null,
      date: '2026-09-04',
      category: 'FOOD',
      merchant: null,
      description: '午餐',
    },
  ]),
}));

import { structure } from '@/lib/ai';
import { cerebrasStructure } from '@/lib/ai/providers/cerebras';
import { openrouterStructure } from '@/lib/ai/providers/openrouter';

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

const originalEnv = process.env.AI_STRUCTURE_PROVIDER;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.AI_STRUCTURE_PROVIDER;
  } else {
    process.env.AI_STRUCTURE_PROVIDER = originalEnv;
  }
});

describe('structure', () => {
  it('未设置 AI_STRUCTURE_PROVIDER 时默认走 Cerebras', async () => {
    delete process.env.AI_STRUCTURE_PROVIDER;
    const out = await structure('早餐25', ctx);
    expect(cerebrasStructure).toHaveBeenCalledWith('早餐25', ctx);
    expect(openrouterStructure).not.toHaveBeenCalled();
    expect(out[0].amount).toBe(25);
  });

  it('显式设置 CEREBRAS 时走 Cerebras', async () => {
    process.env.AI_STRUCTURE_PROVIDER = 'CEREBRAS';
    await structure('早餐25', ctx);
    expect(cerebrasStructure).toHaveBeenCalledWith('早餐25', ctx);
    expect(openrouterStructure).not.toHaveBeenCalled();
  });

  it('显式设置 OPENROUTER 时走 OpenRouter', async () => {
    process.env.AI_STRUCTURE_PROVIDER = 'OPENROUTER';
    const out = await structure('午餐30', ctx);
    expect(openrouterStructure).toHaveBeenCalledWith('午餐30', ctx);
    expect(cerebrasStructure).not.toHaveBeenCalled();
    expect(out[0].amount).toBe(30);
  });

  it('取值非法（如拼错）时直接抛错，不静默兜底到 Cerebras', async () => {
    process.env.AI_STRUCTURE_PROVIDER = 'OPENROTUER';
    await expect(structure('x', ctx)).rejects.toThrow(/AI_STRUCTURE_PROVIDER/);
    expect(cerebrasStructure).not.toHaveBeenCalled();
    expect(openrouterStructure).not.toHaveBeenCalled();
  });
});
