import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import { Composer } from '@/components/Composer';
import { ApiError } from '@/lib/apiError';

// Mock VoiceButton：隔离录音链路，聚焦 Composer 的「回填→输入框」逻辑。
vi.mock('@/components/VoiceButton', () => ({
  VoiceButton: (props: { onTranscribed: (t: string) => void }) => (
    <button type="button" onClick={() => props.onTranscribed('Woolworths 买菜')}>
      voice-mock
    </button>
  ),
}));

describe('Composer', () => {
  it('提交后把文本交给 onSubmit 并清空输入框', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith('早餐麦当劳25');
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
  });

  it('提交瞬间（在 onSubmit resolve 之前）就清空输入框，而非等成功后才清空（回归：Finding 3）', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // 此时 onSubmit 尚未 resolve（仍在"提交中…"），框应已经清空——
    // 这样用户才能在这次提交仍在途时安心继续输入下一句，
    // 不会被随后到来的成功回调用 setText('') 误清掉
    await screen.findByRole('button', { name: 'Submitting…' });
    expect(box.value).toBe('');

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeDefined());
  });

  it('提交中在框里继续输入下一句，前一次提交成功后不会清掉这句新内容（回归：Finding 3）', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('button', { name: 'Submitting…' });

    // 第一笔仍在途时，用户已经开始输入第二句
    await user.type(box, '午餐30');
    expect(box.value).toBe('午餐30');

    // 第一笔此刻才成功——旧代码里 setText('') 清的是"此刻框里的内容"，
    // 会把用户刚打的第二句一起清掉；修复后第一笔的清空发生在提交瞬间，
    // 与此刻框里的新内容无关
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeDefined());
    expect(box.value).toBe('午餐30');
  });

  it('空输入时提交按钮禁用', () => {
    render(<Composer onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveProperty('disabled', true);
  });

  it('提交进行中禁用按钮并显示提交中（防重复提交，§9）', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Composer onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), '早餐25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const btn = await screen.findByRole('button', { name: 'Submitting…' });
    expect(btn).toHaveProperty('disabled', true);

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeDefined());
  });

  it('提交失败时保留输入内容供用户重试，且显示通用错误文案（无 code）', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox');
    await user.type(box, '早餐25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toBe('Failed to save, please retry');
    expect((box as HTMLTextAreaElement).value).toBe('早餐25');
  });

  it('提交失败带 UNAUTHENTICATED code → 显示"请先登录"而非通用文案', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new ApiError('未登录', 'UNAUTHENTICATED'));
    render(<Composer onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), '早餐25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Please log in first'),
    );
  });

  it('语音转写结果回填输入框（用户确认后提交，§9）', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;

    // 触发 mocked VoiceButton 的 onTranscribed
    await user.click(screen.getByRole('button', { name: /voice-mock/ }));
    expect(box.value).toBe('Woolworths 买菜');

    // 回填后由用户点击提交，复用既有流程
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledWith('Woolworths 买菜');
  });

  it('已有文本时语音回填追加到末尾并以空格分隔', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;

    await user.type(box, '买菜');
    await user.click(screen.getByRole('button', { name: /voice-mock/ }));
    expect(box.value).toBe('买菜 Woolworths 买菜');
  });
});
