/**
 * Toast 系统——模块级 store（与 sync/status.ts、ledger/store.ts 同构的
 * 外部存储 + 订阅模式）。`useToast()` 只暴露稳定的 `push`；快照订阅方
 * 只有 <Toaster /> 自己（用 useSyncExternalStore 消费）。
 *
 * Plan 5 决策（Global Constraint 4）：整包 Radix 只用在 Toast 上——
 * focus 管理、自动关闭计时、滑动消除都是容易手写出 subtle bug 的交互。
 */
export type ToastVariant = 'success' | 'warning' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastInput = {
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
  /**
   * 任意关闭路径（自动超时、滑动、点动作、点关闭）触发后回调，幂等。
   * 用于让调用方清理产生这条提示的临时状态（如 UndoToast 清 lastAdded）。
   */
  onDismiss?: () => void;
};

export type ToastItem = ToastInput & { id: number };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 不变更时必须返回同一引用（§6.6 对 getSnapshot 的既定规则）。 */
export function getSnapshot(): ToastItem[] {
  return toasts;
}

export function pushToast(input: ToastInput): void {
  toasts = [...toasts, { ...input, id: nextId++ }];
  emit();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** 仅测试用：清空模块级状态，避免用例间污染。 */
export function resetToastStoreForTests(): void {
  toasts = [];
  nextId = 1;
  emit();
}

/** 稳定的 push 引用，供组件在 effect 依赖里放心使用。 */
export function useToast() {
  return { push: pushToast };
}