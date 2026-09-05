/**
 * jsdom 不实现真实页面导航——`window.location.href = '/x'` 会被静默拒绝
 * （控制台打一行 "Not implemented: navigation to another Document"，
 * `href` 值原地不变），不是抛异常，容易被误以为断言通过了实际什么也没
 * 验证到（这个坑之前在 settings 页的登出跳转测试里就中过一次：断言目标
 * 恰好和 jsdom 默认 URL 相同，看着像"跳转成功"，其实从来没真的验证过
 * 赋值生效）。用一个可写的纯对象整个替换掉 window.location，让
 * `.href =` 变成普通属性赋值，测试后再还原。
 */
export function stubLocation(initialHref = 'http://localhost:3000/'): {
  restore: () => void;
} {
  const original = window.location;
  const stub = { href: initialHref } as Location;
  Object.defineProperty(window, 'location', { value: stub, writable: true, configurable: true });
  return {
    restore: () => {
      Object.defineProperty(window, 'location', {
        value: original,
        writable: true,
        configurable: true,
      });
    },
  };
}
