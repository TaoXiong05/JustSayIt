import { describe, it, expect } from 'vitest';

describe('测试环境', () => {
  it('fake-indexeddb 已注入', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).not.toBeNull();
  });
});
