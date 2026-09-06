import { describe, it, expect, vi } from 'vitest';
import { createEmitter } from '@/lib/emitter';

describe('createEmitter', () => {
  it('emit() 调用所有已订阅的监听者', () => {
    const { subscribe, emit } = createEmitter();
    const a = vi.fn();
    const b = vi.fn();
    subscribe(a);
    subscribe(b);
    emit();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('subscribe() 返回的函数取消订阅，之后 emit() 不再调用它', () => {
    const { subscribe, emit } = createEmitter();
    const fn = vi.fn();
    const unsubscribe = subscribe(fn);
    unsubscribe();
    emit();
    expect(fn).not.toHaveBeenCalled();
  });

  it('多个 createEmitter() 实例互相独立', () => {
    const first = createEmitter();
    const second = createEmitter();
    const fn = vi.fn();
    first.subscribe(fn);
    second.emit();
    expect(fn).not.toHaveBeenCalled();
  });
});
