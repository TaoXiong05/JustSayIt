/**
 * 前端最基础的记账文本校验（省一次注定失败的 AI 请求，见 Composer.tsx）：
 * 只要求"看起来含有金额"——一个阿拉伯数字，或常见中文数字字符。
 * 跟 AI 侧放宽后的规则（prompt.ts 规则 9/10：数字+文字才记账）刻意对齐，
 * 保证这道前端校验不会拦掉任何 AI 本来会接受的输入。
 * 没覆盖拼写出来的英文数字词（"three dollars"）——日常记账场景基本不会
 * 这么打字，不值得为此增加复杂度。
 */
const AMOUNT_SIGNAL_PATTERN = /[0-9一二三四五六七八九十百千万两]/;

export function hasAmountSignal(text: string): boolean {
  return AMOUNT_SIGNAL_PATTERN.test(text);
}
