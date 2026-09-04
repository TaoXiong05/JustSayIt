import { describe, it, expect } from 'vitest';
import { periodRange, computeStats } from '@/lib/ledger/stats';
import type { Transaction } from '@/lib/ai/schema';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  type: 'EXPENSE',
  amountCents: 1000,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: 'x',
  ...over,
});

describe('periodRange', () => {
  it('month：返回当月第一天到下月第一天（不含），按指定时区', () => {
    // 2026-09-05 是周六；悉尼时间（UTC+10）此刻是 2026-09-05 早上，
    // UTC 此刻还是 2026-09-04 晚上——用来验证真的按 timeZone 算，不是按 UTC
    const referenceDate = new Date('2026-09-04T20:00:00Z');
    expect(periodRange('month', referenceDate, 'Australia/Sydney')).toEqual({
      start: '2026-09-01',
      end: '2026-10-01',
    });
  });

  it('month：12 月要跨年到下一年 1 月', () => {
    const referenceDate = new Date('2026-12-15T00:00:00Z');
    expect(periodRange('month', referenceDate, 'UTC')).toEqual({
      start: '2026-12-01',
      end: '2027-01-01',
    });
  });

  it('week：周一为起点，跨度 7 天', () => {
    // 2026-09-09 是周三（UTC）
    const referenceDate = new Date('2026-09-09T12:00:00Z');
    const range = periodRange('week', referenceDate, 'UTC');
    expect(range.start).toBe('2026-09-07'); // 本周一
    expect(range.end).toBe('2026-09-14'); // 下周一
  });

  it('week：参考日本身就是周一时，起点是当天', () => {
    const referenceDate = new Date('2026-09-07T12:00:00Z'); // 周一
    expect(periodRange('week', referenceDate, 'UTC').start).toBe('2026-09-07');
  });

  it('week：参考日是周日时，起点是上周一（ISO 周日=当周最后一天）', () => {
    const referenceDate = new Date('2026-09-13T12:00:00Z'); // 周日
    expect(periodRange('week', referenceDate, 'UTC').start).toBe('2026-09-07');
  });
});

describe('computeStats', () => {
  const referenceDate = new Date('2026-09-05T00:00:00Z');

  it('按币种分组，不跨币种求和', () => {
    const out = computeStats(
      [tx({ currency: 'AUD', amountCents: 1000 }), tx({ currency: 'USD', amountCents: 2000 })],
      'month',
      referenceDate,
      'UTC',
    );
    expect(out).toHaveLength(2);
    const aud = out.find((c) => c.currency === 'AUD');
    const usd = out.find((c) => c.currency === 'USD');
    expect(aud?.totalExpenseCents).toBe(1000);
    expect(usd?.totalExpenseCents).toBe(2000);
  });

  it('EXPENSE 按分类聚合总支出，INCOME 单独累计不参与抵扣', () => {
    const out = computeStats(
      [
        tx({ type: 'EXPENSE', category: 'FOOD', amountCents: 1000 }),
        tx({ type: 'EXPENSE', category: 'FOOD', amountCents: 500 }),
        tx({ type: 'EXPENSE', category: 'TRANSPORT', amountCents: 300 }),
        tx({ type: 'INCOME', category: 'SALARY', amountCents: 500000 }),
      ],
      'month',
      referenceDate,
      'UTC',
    );
    const aud = out[0];
    expect(aud.totalExpenseCents).toBe(1800); // 1000+500+300，收入不参与
    expect(aud.totalIncomeCents).toBe(500000);
    const food = aud.expenseByCategory.find((c) => c.category === 'FOOD');
    expect(food?.totalCents).toBe(1500);
    expect(food?.transactions).toHaveLength(2);
    // INCOME 类目不出现在 expenseByCategory 里
    expect(aud.expenseByCategory.find((c) => c.category === 'SALARY')).toBeUndefined();
  });

  it('expenseByCategory 按金额降序排列', () => {
    const out = computeStats(
      [
        tx({ category: 'FOOD', amountCents: 100 }),
        tx({ category: 'TRANSPORT', amountCents: 900 }),
      ],
      'month',
      referenceDate,
      'UTC',
    );
    expect(out[0].expenseByCategory.map((c) => c.category)).toEqual(['TRANSPORT', 'FOOD']);
  });

  it('只统计口径落在当前周期内的账目（按 date 字段，不含边界外的）', () => {
    const out = computeStats(
      [
        tx({ date: '2026-08-31', amountCents: 100 }), // 上月最后一天，不算
        tx({ date: '2026-09-01', amountCents: 200 }), // 本月第一天，算
        tx({ date: '2026-09-30', amountCents: 300 }), // 本月最后一天，算
        tx({ date: '2026-10-01', amountCents: 400 }), // 下月第一天，不算
      ],
      'month',
      referenceDate,
      'UTC',
    );
    expect(out[0].totalExpenseCents).toBe(500);
  });

  it('周期内没有账目时返回空数组，不报错', () => {
    expect(computeStats([], 'month', referenceDate, 'UTC')).toEqual([]);
  });
});
