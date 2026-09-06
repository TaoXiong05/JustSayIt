/**
 * 商户名比较用的规范形式：去空格、转小写。
 * normalize.ts（历史写法模糊匹配）与 auMerchantAliases.ts（澳洲连锁商户
 * 别名精确匹配）共用同一份实现，抽到这个独立文件——两边互相 import
 * 对方会形成循环依赖。
 */
export function canon(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}
