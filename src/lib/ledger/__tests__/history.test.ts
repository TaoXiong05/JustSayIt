import { describe, it, expect } from 'vitest';
import { groupByDay, filterHistory, recentTransactions } from '@/lib/ledger/history';
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

describe('groupByDay', () => {
  it('按天分组并保持日期降序（replay.ts 的既有顺序）', () => {
    const out = groupByDay([
      tx({ date: '2026-09-04', description: '旧' }),
      tx({ date: '2026-09-05', description: '新' }),
    ]);
    expect(out.map((g) => g.date)).toEqual(['2026-09-05', '2026-09-04']);
    expect(out[0].items).toHaveLength(1);
  });

  it('同日多笔按传入顺序收进同一组', () => {
    const out = groupByDay([
      tx({ id: 'a', date: '2026-09-05' }),
      tx({ id: 'b', date: '2026-09-05' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].items.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('同日多币种产生两条 subtotalsByCurrency，绝不跨币种求和（Global Constraint 2）', () => {
    const out = groupByDay([
      tx({ currency: 'AUD', amountCents: 1000, date: '2026-09-05' }),
      tx({ currency: 'USD', amountCents: 2000, date: '2026-09-05' }),
    ]);
    expect(out[0].subtotalsByCurrency).toHaveLength(2);
    const aud = out[0].subtotalsByCurrency.find((s) => s.currency === 'AUD');
    const usd = out[0].subtotalsByCurrency.find((s) => s.currency === 'USD');
    expect(aud?.netCents).toBe(-1000);
    expect(usd?.netCents).toBe(-2000);
  });

  it('当日小计是收入减支出的净额（区别于 Stats 的 income/expense 分开口径）', () => {
    const out = groupByDay([
      tx({ type: 'INCOME', amountCents: 5000, date: '2026-09-05' }),
      tx({ type: 'EXPENSE', amountCents: 1200, date: '2026-09-05' }),
    ]);
    expect(out[0].subtotalsByCurrency).toEqual([{ currency: 'AUD', netCents: 3800 }]);
  });

  it('空数组返回空', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('filterHistory', () => {
  const data = [
    tx({ id: 'a', date: '2026-09-01', merchant: 'Coles', description: 'groceries' }),
    tx({ id: 'b', date: '2026-09-15', merchant: 'Uber', description: 'ride home' }),
  ];

  it('基于 date 字段的字符串比较，边界日期双闭包含（同 computeStats 模式）', () => {
    const out = filterHistory(data, { dateFrom: '2026-09-01', dateTo: '2026-09-01' });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('dateFrom/dateTo 各自可选，缺省即无界', () => {
    expect(filterHistory(data, { dateTo: '2026-09-01' }).map((t) => t.id)).toEqual(['a']);
    expect(filterHistory(data, { dateFrom: '2026-09-15' }).map((t) => t.id)).toEqual(['b']);
    expect(filterHistory(data, {})).toHaveLength(2);
  });

  it('keyword 仅匹配 merchant 或 description，不带关键词返回全量', () => {
    expect(filterHistory(data, { keyword: 'coles' }).map((t) => t.id)).toEqual(['a']);
    expect(filterHistory(data, { keyword: 'RIDE' }).map((t) => t.id)).toEqual(['b']); // 大小写不敏感
    expect(filterHistory(data, { keyword: '不存在' })).toEqual([]);
  });

  it('keyword 不匹配 category（搜索边界来自设计咨询）', () => {
    // FOOD 是 category 不是 merchant/description，不应命中
    expect(filterHistory(data, { keyword: 'FOOD' })).toEqual([]);
  });

  it('日期与关键词同时出现时取交集', () => {
    const out = filterHistory(data, { dateFrom: '2026-09-10', keyword: 'uber' });
    expect(out.map((t) => t.id)).toEqual(['b']);
  });
});

describe('recentTransactions', () => {
  it('按 replay.ts 的自然顺序（date 降序）取前 n 笔', () => {
    const data = [
      tx({ id: 'newest', date: '2026-09-05' }),
      tx({ id: 'middle', date: '2026-09-03' }),
      tx({ id: 'oldest', date: '2026-09-01' }),
    ];
    expect(recentTransactions(data, 2).map((t) => t.id)).toEqual(['newest', 'middle']);
    expect(recentTransactions(data, 0)).toEqual([]);
    expect(recentTransactions(data, 99)).toEqual(data);
  });
});