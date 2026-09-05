import type { CategoryKey } from '@/lib/ai/schema';

export type CategoryTint = { bg: string; fg: string };

/**
 * 装饰性配色循环池——跟 income/expense/brand/danger/warning 语义色完全
 * 脱钩（Global Constraint 1 只约束"语义色不能被复用挪作他用"，不禁止
 * 引入新的、不承载任何交易语义的装饰色）。8 种色循环分配给 17 个分类，
 * 不追求每个分类都撞色不重复——参考设计里头像方块的作用是"让列表有
 * 视觉节奏"，不是"颜色本身编码信息"。
 */
const PALETTE: CategoryTint[] = [
  { bg: 'bg-orange-100 dark:bg-orange-500/15', fg: 'text-orange-600 dark:text-orange-400' },
  { bg: 'bg-sky-100 dark:bg-sky-500/15', fg: 'text-sky-600 dark:text-sky-400' },
  { bg: 'bg-violet-100 dark:bg-violet-500/15', fg: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-teal-100 dark:bg-teal-500/15', fg: 'text-teal-600 dark:text-teal-400' },
  { bg: 'bg-rose-100 dark:bg-rose-500/15', fg: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/15', fg: 'text-fuchsia-600 dark:text-fuchsia-400' },
  { bg: 'bg-lime-100 dark:bg-lime-500/15', fg: 'text-lime-600 dark:text-lime-400' },
  { bg: 'bg-cyan-100 dark:bg-cyan-500/15', fg: 'text-cyan-600 dark:text-cyan-400' },
];

/** Record<CategoryKey, ...> 的穷尽性检查：新增分类时编译器会强制在这里补一条。 */
export const CATEGORY_TINTS: Record<CategoryKey, CategoryTint> = {
  FOOD: PALETTE[0],
  TRANSPORT: PALETTE[1],
  SHOPPING: PALETTE[2],
  HOUSING: PALETTE[3],
  DAILY: PALETTE[4],
  ENTERTAINMENT: PALETTE[5],
  MEDICAL: PALETTE[6],
  EDUCATION: PALETTE[7],
  SOCIAL: PALETTE[0],
  SUBSCRIPTION: PALETTE[1],
  TRAVEL: PALETTE[2],
  SALARY: PALETTE[3],
  SIDE_INCOME: PALETTE[4],
  INVESTMENT: PALETTE[5],
  REFUND: PALETTE[6],
  GIFT: PALETTE[7],
  OTHER: PALETTE[0],
};
