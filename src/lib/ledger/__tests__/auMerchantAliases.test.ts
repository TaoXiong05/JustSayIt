import { describe, it, expect } from 'vitest';
import { resolveAuMerchantAlias, AU_MERCHANT_ALIASES } from '@/lib/ledger/auMerchantAliases';

describe('resolveAuMerchantAlias', () => {
  it('已知缩写/俗称精确匹配到官方名', () => {
    expect(resolveAuMerchantAlias('Woolies')).toBe('Woolworths');
    expect(resolveAuMerchantAlias('JB')).toBe('JB Hi-Fi');
    expect(resolveAuMerchantAlias('Maccas')).toBe("McDonald's");
  });

  it('已知的常见 STT 听错写法也能匹配（用户反馈原话：Woolworths 被听成 wall wars）', () => {
    expect(resolveAuMerchantAlias('wall wars')).toBe('Woolworths');
  });

  it('忽略大小写与空格差异', () => {
    expect(resolveAuMerchantAlias('woolies')).toBe('Woolworths');
    expect(resolveAuMerchantAlias('  WOOLIES  ')).toBe('Woolworths');
    expect(resolveAuMerchantAlias('jb hifi')).toBe('JB Hi-Fi');
  });

  it('未收录的写法返回 null，不强行猜测', () => {
    expect(resolveAuMerchantAlias('Coles')).toBeNull();
    expect(resolveAuMerchantAlias('随便写点什么')).toBeNull();
  });

  it('不收录横跨多个品牌的通用俗语（如 servo/bottle-o）——这类词映射到单一品牌会记错商户', () => {
    expect(resolveAuMerchantAlias('servo')).toBeNull();
    expect(resolveAuMerchantAlias('bottle-o')).toBeNull();
  });

  it('词典本身：每个 canonical 名下至少有一个别名，不会出现无意义的空条目', () => {
    for (const [canonical, aliases] of Object.entries(AU_MERCHANT_ALIASES)) {
      expect(aliases.length, `${canonical} 应至少有一个别名`).toBeGreaterThan(0);
    }
  });
});
