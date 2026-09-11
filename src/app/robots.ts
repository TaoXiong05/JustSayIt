import type { MetadataRoute } from 'next';

const BASE_URL = 'https://justsayit.taoxiong.site';

// 屏蔽的都是需要登录才有内容的应用内屏幕（/ledger /history /stats
// /settings）——爬虫抓到的只会是重定向壳或加载态，没有可索引内容，还
// 会稀释真正想被收录的 /login /privacy /terms。/ 保留可抓取：它本身
// 只是个重定向，抓了没有风险，没必要屏蔽站点根路径。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/ledger', '/history', '/stats', '/settings'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
