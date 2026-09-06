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

  it('短名称不做模糊匹配，避免误并两个不同的真实商户（回归：Finding 1）', () => {
    expect(normalizeMerchant('永旺', ['永辉'])).toBe('永旺');
    expect(normalizeMerchant('Aldi', ['Coles', 'Audi', 'Woolworths'])).toBe('Aldi');
    expect(normalizeMerchant('全家', ['全聚'])).toBe('全家');
    expect(normalizeMerchant('7-11', ['7-12'])).toBe('7-11');
    expect(normalizeMerchant('星巴克', ['星巴哥'])).toBe('星巴克');
  });

  it('短名称精确匹配（忽略大小写/空格）仍归并到历史写法', () => {
    expect(normalizeMerchant('永辉', ['永辉'])).toBe('永辉');
    expect(normalizeMerchant('bp', ['BP'])).toBe('BP');
  });

  it('澳洲常见连锁商户的缩写/俗称优先归并到官方名，哪怕用户历史里从没出现过（词典精确匹配，见 auMerchantAliases.ts）', () => {
    expect(normalizeMerchant('woolies', [])).toBe('Woolworths');
    expect(normalizeMerchant('JB', [])).toBe('JB Hi-Fi');
  });

  it('别名词典命中时优先于历史模糊匹配，不会被别的历史写法抢走', () => {
    // "Woolys" 本该模糊匹配到历史里的 "Woolworth"，但词典精确匹配优先级更高，
    // 应该直接给出官方名 "Woolworths"。
    expect(normalizeMerchant('Woolys', ['Woolworth'])).toBe('Woolworths');
  });

  it('不在词典里的写法，词典不介入，照常走历史模糊匹配', () => {
    expect(normalizeMerchant('Colse', ['Coles'])).toBe('Coles');
  });
});
