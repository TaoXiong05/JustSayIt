import { ALL_CATEGORIES } from '@/lib/ai/schema';

export type StructureContext = {
  /** 用户本地时间，ISO 8601 含时区偏移 */
  localTime: string;
  /** IANA 时区，如 Australia/Sydney */
  timeZone: string;
  /** 用户档案默认币种，ISO 4217 */
  defaultCurrency: string;
};

/**
 * 每个分类 key 的中文释义，用于组装 CATEGORY_GLOSSARY。
 * 这不是调优而是正确性要求（spec §10.2a）——缺少释义时实测出现
 * 「Woolworths 买菜」被归入 GIFT 的错误。
 *
 * 键集合直接来自 `ALL_CATEGORIES`（`@/lib/ai/schema` 的单一事实来源）。
 * 类型标注为 `Record<CategoryKey, string>` 做穷尽性检查：未来 schema 新增
 * 第 18 个分类而这里未同步补释义时，缺键会导致 TypeScript 编译报错，
 * 不会静默漏释义。
 */
const CATEGORY_GLOSS: Record<(typeof ALL_CATEGORIES)[number], string> = {
  FOOD: '餐饮、买菜、外卖、咖啡、零食',
  TRANSPORT: '交通、加油、停车、打车、公共交通',
  SHOPPING: '服饰、电子产品、家居用品等非日常采购',
  HOUSING: '房租、房贷、水电煤、物业',
  DAILY: '日用消耗品、清洁用品、个护',
  ENTERTAINMENT: '娱乐、订票、游戏、健身',
  MEDICAL: '医疗、药品、看诊',
  EDUCATION: '学费、书籍、课程',
  SOCIAL: '人情往来、请客、红包',
  SUBSCRIPTION: '订阅服务、会员费',
  TRAVEL: '旅行、住宿、机票',
  SALARY: '工资',
  SIDE_INCOME: '副业收入',
  INVESTMENT: '投资收益',
  REFUND: '退款',
  GIFT: '收到的礼金',
  OTHER: '无法归入以上任何一类',
};

/** 由 ALL_CATEGORIES 逐一生成释义文本，保证覆盖全部 key 且随 schema 同步。 */
const CATEGORY_GLOSSARY = ALL_CATEGORIES.map(
  (key) => `   ${key} ${CATEGORY_GLOSS[key]}`,
).join('\n');

/**
 * 系统提示词。
 * 只讲抽取规则，不讲输出格式——格式由 structured output 的 schema 负责（§10.6）。
 */
export function buildSystemPrompt(ctx: StructureContext): string {
  return `你是一个记账信息抽取器。从用户输入中抽取所有收入和支出记录。

【上下文】
当前本地时间：${ctx.localTime}
用户时区：${ctx.timeZone}
默认币种：${ctx.defaultCurrency}

【抽取规则】
1. 一条输入包含多笔收支时，拆分成多条记录。
2. amount 永远为正数。收支方向只由 type 表示，不要用负数表示收入。
3. amount 单位为「元」，最多两位小数。口语化表达（如"五十四块三"）转成 54.3。
4. date 依据上文的当前本地时间推算，输出 YYYY-MM-DD。"今天""昨天""上周五"等
   相对表达必须解析成绝对日期；没有时间线索时用今天。
5. currency 只在用户明确说出币种时填写（如"美元""欧元"），否则填 null。
   仅出现"块""元"等不含币种信息的量词时，一律填 null。
6. merchant 填写可识别的商户或品牌名，有官方英文名的品牌使用官方英文写法
   （McDonald's、Woolworths、Uber Eats），无法识别时填 null。
7. description 简要描述事由，不要重复 merchant 的内容。
8. category 从下列释义中选择，无法判断时用 OTHER：
${CATEGORY_GLOSSARY}
9. 输入中不包含任何收支信息时，返回空的 records 数组。不要凭空编造记录。`;
}
