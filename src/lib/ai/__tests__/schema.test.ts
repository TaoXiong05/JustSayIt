import { describe, it, expect } from 'vitest';
import {
  ALL_CATEGORIES,
  AiTransactionSchema,
  AiResponseSchema,
  toCents,
  toTransaction,
} from '@/lib/ai/schema';

const valid = {
  type: 'EXPENSE' as const,
  amount: 54.3,
  currency: null,
  date: '2026-09-04',
  category: 'FOOD' as const,
  merchant: 'Woolworths',
  description: '买菜',
};

describe('分类枚举', () => {
  it('共 17 个 key 且无重复', () => {
    expect(ALL_CATEGORIES).toHaveLength(17);
    expect(new Set(ALL_CATEGORIES).size).toBe(17);
  });
});

describe('AiTransactionSchema', () => {
  it('接受合法记录', () => {
    expect(AiTransactionSchema.parse(valid)).toMatchObject({ amount: 54.3 });
  });

  it('拒绝负数金额（方向只由 type 表示）', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
  });

  it('拒绝超过两位小数的金额', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, amount: 1.005 }).success).toBe(false);
  });

  it('接受恰好两位小数', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, amount: 18.9 }).success).toBe(true);
    expect(AiTransactionSchema.safeParse({ ...valid, amount: 0.01 }).success).toBe(true);
  });

  it('拒绝枚举外的分类', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, category: '餐饮' }).success).toBe(false);
  });

  it('拒绝 EXPENSE 配收入专用分类', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, category: 'SALARY' }).success).toBe(false);
  });

  it('允许 OTHER 用于收支两侧', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, category: 'OTHER' }).success).toBe(true);
    expect(
      AiTransactionSchema.safeParse({ ...valid, type: 'INCOME', category: 'OTHER' }).success,
    ).toBe(true);
  });

  it('拒绝非 YYYY-MM-DD 的日期', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, date: '2026/09/04' }).success).toBe(false);
  });
});

describe('AiResponseSchema', () => {
  it('允许空数组（输入不含账目时）', () => {
    expect(AiResponseSchema.parse({ records: [] }).records).toEqual([]);
  });
});

describe('toCents', () => {
  it('两位小数金额转换精确', () => {
    expect(toCents(54.3)).toBe(5430);
    expect(toCents(18.9)).toBe(1890);
    expect(toCents(25)).toBe(2500);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(2400)).toBe(240000);
  });
});

describe('toTransaction', () => {
  it('金额转为整数分，currency 为 null 时补默认值', () => {
    const t = toTransaction(valid, { id: 'tx1', defaultCurrency: 'AUD' });
    expect(t.amountCents).toBe(5430);
    expect(t.currency).toBe('AUD');
    expect(t.id).toBe('tx1');
  });

  it('AI 明确给出币种时不被默认值覆盖', () => {
    const t = toTransaction({ ...valid, currency: 'USD' }, { id: 'tx2', defaultCurrency: 'AUD' });
    expect(t.currency).toBe('USD');
  });
});
