import type { MetadataRoute } from 'next';

const BASE_URL = 'https://justsayit.taoxiong.site';

// 只列真正有公开内容的页面。/ 不在此列——它是纯客户端重定向壳，没有
// 内容可索引；/ledger /history /stats /settings 需要登录，同样不列
// （见 robots.ts 里对应的 disallow）。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/login`, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
