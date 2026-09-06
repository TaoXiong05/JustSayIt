import { describe, it, expect } from 'vitest';
import { hasAmountSignal } from '@/lib/ledger/textValidation';

describe('hasAmountSignal', () => {
  it('含阿拉伯数字时通过', () => {
    expect(hasAmountSignal('lunch 15')).toBe(true);
    expect(hasAmountSignal('午饭15块')).toBe(true);
  });

  it('含中文数字字符时通过', () => {
    expect(hasAmountSignal('午饭十五块')).toBe(true);
    expect(hasAmountSignal('两杯咖啡')).toBe(true);
  });

  it('没有任何数字信号时不通过', () => {
    expect(hasAmountSignal('sdsadsdsafsdfgasdsad')).toBe(false);
    expect(hasAmountSignal('hello world')).toBe(false);
    expect(hasAmountSignal('')).toBe(false);
  });

  it('拼写出来的英文数字词不算数（已知的覆盖局限，日常记账基本不会这么打字）', () => {
    expect(hasAmountSignal('three dollars for lunch')).toBe(false);
  });
});
