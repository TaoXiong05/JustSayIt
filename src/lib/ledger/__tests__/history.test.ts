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

  it('当天笔数超过 n 时，取当天最新写入的那几笔，不是最早的（回归：曾误用 slice(0,n)）', () => {
    // replay.ts：整体按 date 降序，但同一天内保持事件写入顺序（旧→新）。
    // 今天（09-05）写入顺序是 t1..t5（t5 最新）；朴素 slice(0, n=3) 会切到
    // [t1,t2,t3]（今天最早的三笔），漏掉刚记的 t4/t5。正确结果应是
    // [t5,t4,t3]——今天真正最新的三笔。
    const data = [
      tx({ id: 't1', date: '2026-09-05', description: '今天第1笔' }),
      tx({ id: 't2', date: '2026-09-05', description: '今天第2笔' }),
      tx({ id: 't3', date: '2026-09-05', description: '今天第3笔' }),
      tx({ id: 't4', date: '2026-09-05', description: '今天第4笔' }),
      tx({ id: 't5', date: '2026-09-05', description: '今天第5笔（刚记的）' }),
      tx({ id: 'yesterday', date: '2026-09-04' }),
    ];
    expect(recentTransactions(data, 3).map((t) => t.id)).toEqual(['t5', 't4', 't3']);
  });

  it('跨天边界：当天不够 n 笔时，接着从更早的一天补齐，且同样取该天最新的', () => {
    const data = [
      tx({ id: 'today-1', date: '2026-09-05' }),
      tx({ id: 'yest-1', date: '2026-09-04' }),
      tx({ id: 'yest-2', date: '2026-09-04' }),
      tx({ id: 'yest-3', date: '2026-09-04' }),
    ];
    // 今天 1 笔 + 昨天补 2 笔（昨天内新→旧：yest-3, yest-2）
    expect(recentTransactions(data, 3).map((t) => t.id)).toEqual([
      'today-1',
      'yest-3',
      'yest-2',
    ]);
  });
});