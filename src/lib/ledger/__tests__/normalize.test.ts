import { describe, it, expect } from 'vitest';
import { normalizeMerchant } from '@/lib/ledger/normalize';

describe('normalizeMerchant', () => {
  it('null 原样返回', () => {
    expect(normalizeMerchant(null, ['Woolworths'])).toBeNull();
  });

  it('历史为空时保留原值', () => {
    expect(normalizeMerchant('Woolworths', [])).toBe('Woolworths');
  });

  it('完全一致时返回历史写法', () => {
    expect(normalizeMerchant('Woolworths', ['Woolworths'])).toBe('Woolworths');
  });

  it('忽略大小写与空格差异，归并到历史写法', () => {
    expect(normalizeMerchant('woolworths', ['Woolworths'])).toBe('Woolworths');
    expect(normalizeMerchant('Uber  Eats', ['Uber Eats'])).toBe('Uber Eats');
  });

  it('轻微拼写差异归并到历史写法（STT 错拼的主要形态）', () => {
    expect(normalizeMerchant('Woolworth', ['Woolworths'])).toBe('Woolworths');
    expect(normalizeMerchant('woworths', ['Woolworths'])).toBe('Woolworths');
  });

  it('差异过大时保留原值，不强行归并', () => {
    expect(normalizeMerchant('Coles', ['Woolworths'])).toBe('Coles');
    expect(normalizeMerchant('麦当劳', ['Woolworths'])).toBe('麦当劳');
  });

  it('多个候选时取最接近的', () => {
    expect(normalizeMerchant('Colse', ['Woolworths', 'Coles', 'Aldi'])).toBe('Coles');
  });
});
