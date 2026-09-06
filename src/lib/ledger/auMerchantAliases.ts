import { canon } from '@/lib/ledger/merchantCanon';

/**
 * 澳洲常见连锁商户的缩写/俗称/已知的常见 STT 听错写法 → 官方名。
 * 只收"能确定性对应到唯一商户"的写法——"servo"（加油站泛称，可能是
 * Shell/BP/Caltex/Ampol 好几家）、"bottle-o"（酒类零售店泛称）这类横跨
 * 多个品牌的通用俗语故意不收：收了会把账目错记到某个具体品牌头上，
 * 比不识别更糟（宁可漏，不可错，同 normalize.ts 模糊匹配的取舍原则）。
 *
 * "Wall Wars"是 Woolworths 被 STT 听错的真实案例（用户反馈）；其余品牌
 * 目前只收确认的缩写/俗称，没有编造未经证实的听错写法。
 */
export const AU_MERCHANT_ALIASES: Record<string, string[]> = {
  Woolworths: ['Woolies', 'Woolys', 'WW', 'Wall Wars'],
  'Bunnings Warehouse': ['Bunnings'],
  'JB Hi-Fi': ['JB', 'JB HiFi', 'JBHIFI'],
  'Chemist Warehouse': ['CW', 'Chemist Whs'],
  'Priceline Pharmacy': ['Priceline'],
  "McDonald's": ["Macca's", 'Maccas'],
  'Guzman y Gomez': ['GYG'],
  "Hungry Jack's": ['HJs', 'Hungry Jacks'],
  'Boost Juice': ['Boost'],
  "Dan Murphy's": ["Dan's", 'Dans', 'Dan Murphys'],
  'Australia Post': ['Auspost', 'AusPost'],
  'St Vincent de Paul': ["Vinnie's", 'Vinnies'],
};

const ALIAS_LOOKUP: Map<string, string> = new Map();
for (const [canonical, aliases] of Object.entries(AU_MERCHANT_ALIASES)) {
  for (const alias of aliases) ALIAS_LOOKUP.set(canon(alias), canonical);
}

/** 精确匹配（忽略大小写/空格）；命中返回官方名，未命中返回 null，不强行猜测。 */
export function resolveAuMerchantAlias(input: string): string | null {
  return ALIAS_LOOKUP.get(canon(input)) ?? null;
}
