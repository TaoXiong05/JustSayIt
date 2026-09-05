import type { CategoryKey } from '@/lib/ai/schema';

export type CategoryTint = { bg: string; fg: string };

/**
 * 分类头像方块的配色——之前是一个跟内容无关的 8 色循环（按数组下标硬分配，
 * 换个分类顺序颜色就跟着变，配色本身不说明任何事）。改成每个分类单独挑一个
 * 跟它本身的真实世界联想相符的色系（改善方向 #5），比如交通用 blue（路牌/
 * 交通图的通用色）、医疗用 cyan（诊疗环境的冷静感）、教育/旅行共享 sky
 * （开阔、向外的感觉），"钱进来"的一组分类（工资/副业/投资/退款/礼金）
 * 统一用 amber——不是巧合地接近"收入"，是刻意让这一组看起来是一类。
 *
 * 硬性排除 red/rose/green/emerald/lime 整个色系：那是 income/expense
 * 的专属语义色（Global Constraint 1），分类头像纯装饰、不能反过来暗示
 * "这是收入"或"这是支出"。同样排除 indigo（跟 --brand 撞色，见改善
 * 方向 #2：品牌渐变/主色只留给 Logo 一处，不能被分类装饰色稀释）。
 *
 * 类名必须是完整字面量，不能用模板字符串拼接色相——Tailwind v4 的 JIT
 * 只按正则扫描源码文本里出现过的、完整的 utility 类名，扫不到运行时才
 * 拼出来的字符串（这里没有 `bg-${hue}-100` 这种写法，是刻意的）。
 */
export const CATEGORY_TINTS: Record<CategoryKey, CategoryTint> = {
  // 食欲、温度——最直觉的"吃饭"联想色
  FOOD: { bg: 'bg-orange-100 dark:bg-orange-500/15', fg: 'text-orange-600 dark:text-orange-400' },
  // 路牌、交通地图的通用色
  TRANSPORT: { bg: 'bg-blue-100 dark:bg-blue-500/15', fg: 'text-blue-600 dark:text-blue-400' },
  // 精品/零售，"犒赏自己"的调性
  SHOPPING: { bg: 'bg-violet-100 dark:bg-violet-500/15', fg: 'text-violet-600 dark:text-violet-400' },
  // 木、土、家——中性的暖灰
  HOUSING: { bg: 'bg-stone-100 dark:bg-stone-500/15', fg: 'text-stone-600 dark:text-stone-400' },
  // 日常杂物，干净、实用
  DAILY: { bg: 'bg-teal-100 dark:bg-teal-500/15', fg: 'text-teal-600 dark:text-teal-400' },
  // 夜生活、屏幕光、活力
  ENTERTAINMENT: {
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/15',
    fg: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  // 诊疗环境的冷静、清爽
  MEDICAL: { bg: 'bg-cyan-100 dark:bg-cyan-500/15', fg: 'text-cyan-600 dark:text-cyan-400' },
  // 开阔、向上，跟 TRAVEL 共享"向外"的联想
  EDUCATION: { bg: 'bg-sky-100 dark:bg-sky-500/15', fg: 'text-sky-600 dark:text-sky-400' },
  // 人际、社交场合的温度
  SOCIAL: { bg: 'bg-pink-100 dark:bg-pink-500/15', fg: 'text-pink-600 dark:text-pink-400' },
  // 数字订阅服务的常见品牌色调性
  SUBSCRIPTION: {
    bg: 'bg-purple-100 dark:bg-purple-500/15',
    fg: 'text-purple-600 dark:text-purple-400',
  },
  // 天空、远行——跟 EDUCATION 共享同一联想
  TRAVEL: { bg: 'bg-sky-100 dark:bg-sky-500/15', fg: 'text-sky-600 dark:text-sky-400' },
  // "钱进来"这一组统一用 amber：金币/回报的联想，跟 --income 的绿色分开
  SALARY: { bg: 'bg-amber-100 dark:bg-amber-500/15', fg: 'text-amber-600 dark:text-amber-400' },
  SIDE_INCOME: {
    bg: 'bg-amber-100 dark:bg-amber-500/15',
    fg: 'text-amber-600 dark:text-amber-400',
  },
  INVESTMENT: {
    bg: 'bg-amber-100 dark:bg-amber-500/15',
    fg: 'text-amber-600 dark:text-amber-400',
  },
  REFUND: { bg: 'bg-amber-100 dark:bg-amber-500/15', fg: 'text-amber-600 dark:text-amber-400' },
  GIFT: { bg: 'bg-amber-100 dark:bg-amber-500/15', fg: 'text-amber-600 dark:text-amber-400' },
  // 未分类、中性——跟 HOUSING 共享中性暖灰
  OTHER: { bg: 'bg-stone-100 dark:bg-stone-500/15', fg: 'text-stone-600 dark:text-stone-400' },
};
