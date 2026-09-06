import 'fake-indexeddb/auto';

// jsdom（截至 v30）没有实现自己的 BroadcastChannel，`environment: 'jsdom'`
// 下这个全局其实落到了 Node 的进程级实现——不像其它 jsdom 全局那样按测试
// 文件天然隔离。多个测试文件共用同一个 worker 进程时会真实收到彼此发的
// 广播（ledger/store.ts 的跨标签页同步功能触发过这个问题：一个文件里
// push() 触发的广播，被另一个文件里恰好也在监听同名 channel 的 store
// 模块实例收到，在不该发生的时机重新 hydrate()，污染了那个文件的断言）。
// 换成一个只在"这次 setup 脚本执行期间"生效的极简实现——isolate:true 下
// 每个测试文件都会重新跑一遍这个 setup 文件，`channels` 每次都是全新的，
// 天然把隔离范围收窄到单个测试文件内，不需要额外的 teardown。
if (typeof BroadcastChannel !== 'undefined') {
  type Peer = { onmessage: ((e: { data: unknown }) => void) | null; listeners: Set<(e: { data: unknown }) => void> };
  const channels = new Map<string, Set<Peer>>();

  class FakeBroadcastChannel {
    name: string;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    private listeners = new Set<(e: { data: unknown }) => void>();

    constructor(name: string) {
      this.name = name;
      if (!channels.has(name)) channels.set(name, new Set());
      channels.get(name)!.add(this as unknown as Peer);
    }

    postMessage(data: unknown): void {
      const peers = channels.get(this.name);
      if (!peers) return;
      for (const peer of peers) {
        if (peer === (this as unknown as Peer)) continue; // 不给自己发，跟真实 BroadcastChannel 语义一致
        queueMicrotask(() => {
          const event = { data };
          peer.onmessage?.(event);
          for (const l of peer.listeners) l(event);
        });
      }
    }

    addEventListener(type: string, cb: (e: { data: unknown }) => void): void {
      if (type === 'message') this.listeners.add(cb);
    }

    removeEventListener(type: string, cb: (e: { data: unknown }) => void): void {
      if (type === 'message') this.listeners.delete(cb);
    }

    close(): void {
      channels.get(this.name)?.delete(this as unknown as Peer);
    }
  }

  // @ts-expect-error -- 有意换成上面这个测试专用的极简实现
  globalThis.BroadcastChannel = FakeBroadcastChannel;
}

// jsdom 没有实现 Pointer Capture API，而 @radix-ui/react-toast 的滑动关闭
// 手势无条件调用它——不 polyfill 的话每个渲染了 Toast 的测试都会在事件
// 分发时抛出未捕获异常（不是测试逻辑的问题，是 jsdom 本身的能力缺口）。
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
}
