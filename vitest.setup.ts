import 'fake-indexeddb/auto';

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
