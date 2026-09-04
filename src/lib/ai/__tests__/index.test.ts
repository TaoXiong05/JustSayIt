import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/providers/groq', () => ({
  groqStructure: vi.fn().mockResolvedValue([
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

import { structure } from '@/lib/ai';
import { groqStructure } from '@/lib/ai/providers/groq';

describe('structure', () => {
  it('把调用转交给 provider 并原样返回记录', async () => {
    const ctx = {
      localTime: '2026-09-04T19:30:00+10:00',
      timeZone: 'Australia/Sydney',
      defaultCurrency: 'AUD',
    };
    const out = await structure('早餐25', ctx);
    expect(groqStructure).toHaveBeenCalledWith('早餐25', ctx);
    expect(out[0].amount).toBe(25);
  });
});
