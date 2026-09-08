import { z } from 'zod';

/** 支出专用分类（spec §5.2） */
export const EXPENSE_CATEGORIES = [
  'FOOD', 'TRANSPORT', 'SHOPPING', 'HOUSING', 'DAILY',
  'ENTERTAINMENT', 'MEDICAL', 'EDUCATION', 'SOCIAL',
  'SUBSCRIPTION', 'TRAVEL',
] as const;

/** 收入专用分类 */
export const INCOME_CATEGORIES = [
  'SALARY', 'SIDE_INCOME', 'INVESTMENT', 'REFUND', 'GIFT',
] as const;

/** 收支共用 */
export const SHARED_CATEGORIES = ['OTHER'] as const;

export const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  ...SHARED_CATEGORIES,
] as const;

export type CategoryKey = (typeof ALL_CATEGORIES)[number];

/** 金额最多两位小数——规则三的前置校验，越界则 toCents 不再可证明正确 */
const atMostTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** 编辑表单校验用户手改的金额——同一条规则（正数、最多两位小数），供 UI 层复用。 */
export function isValidYuanAmount(n: number): boolean {
  return Number.isFinite(n) && n > 0 && atMostTwoDecimals(n);
}

/** Transaction.date 的规范格式，AI 输出校验和编辑表单校验共用同一个 pattern。 */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const AiTransactionSchema = z
  .object({
    type: z.enum(['EXPENSE', 'INCOME']),
    // 单位「元」。永远为正——方向只由 type 表示（规则二）
    amount: z.number().positive().finite().refine(atMostTwoDecimals, {
      message: '金额最多两位小数',
    }),
    // 仅当用户明确说出币种时非空，否则由客户端补默认值
    currency: z.string().length(3).nullable(),
    date: z.string().regex(DATE_PATTERN, '日期须为 YYYY-MM-DD'),
    category: z.enum(ALL_CATEGORIES),
    merchant: z.string().nullable(),
    description: z.string(),
  })
  .superRefine((t, ctx) => {
    const allowed: readonly string[] =
      t.type === 'EXPENSE'
        ? [...EXPENSE_CATEGORIES, ...SHARED_CATEGORIES]
        : [...INCOME_CATEGORIES, ...SHARED_CATEGORIES];
    if (!allowed.includes(t.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: `分类 ${t.category} 不适用于 ${t.type}`,
      });
    }
  });

export type AiTransaction = z.infer<typeof AiTransactionSchema>;

export const AiResponseSchema = z.object({
  records: z.array(AiTransactionSchema),
});

/** 入库形态：金额为整数分，currency 永不为 null */
export type Transaction = {
  id: string;
  type: 'EXPENSE' | 'INCOME';
  amountCents: number;
  currency: string;
  date: string;
  category: CategoryKey;
  merchant: string | null;
  description: string;
};

/**
 * 元 → 整数分。
 * 对恰好两位小数的值可证明正确（1.005 这类三位小数已被 schema 拒绝）。
 */
export function toCents(yuan: number): number {
  return Math.round(yuan * 100);
}

export function toTransaction(
  ai: AiTransaction,
  opts: { id: string; defaultCurrency: string },
): Transaction {
  return {
    id: opts.id,
    type: ai.type,
    amountCents: toCents(ai.amount),
    currency: ai.currency ?? opts.defaultCurrency,
    date: ai.date,
    category: ai.category,
    merchant: ai.merchant,
    description: ai.description,
  };
}
