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

/**
 * 一次输入能产出的记录条数上限。route 层放行 2000 字符（面向非浏览器
 * 调用方的防御性上限，浏览器侧 Composer 只让输入 80 字），一条正常的
 * 记账口述拆不出 25 笔；给 schema 加上这个约束，让"失控"在结构化输出
 * 这一层就被拦住，而不是靠 token 上限兜底后拿到半截 JSON。
 */
export const MAX_AI_RECORDS = 25;

/**
 * OpenAI 兼容的 strict json_schema response_format（spec §10.2b）：
 * 所有字段必须 required、对象必须 additionalProperties:false、
 * 可空字段用联合类型而非 nullable。Cerebras 与 OpenRouter 用的都是这套
 * 格式，在此共用同一份定义——分类枚举、字段、约束只在一处定义，换 provider
 * 不会导致两处漂移（spec §10.3）。model/temperature/reasoning_effort 等
 * 纯 provider 参数仍留在各自适配器内，不属于这份共享定义。
 */
export const AI_STRICT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'transactions',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          maxItems: MAX_AI_RECORDS,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['EXPENSE', 'INCOME'] },
              amount: { type: 'number' },
              currency: { type: ['string', 'null'] },
              date: { type: 'string' },
              category: { type: 'string', enum: [...ALL_CATEGORIES] },
              merchant: { type: ['string', 'null'] },
              description: { type: 'string' },
            },
            required: ['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['records'],
      additionalProperties: false,
    },
  },
} as const;

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
