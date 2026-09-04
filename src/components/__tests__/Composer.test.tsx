import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '@/components/Composer';

describe('Composer', () => {
  it('提交后把文本交给 onSubmit 并清空输入框', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    expect(onSubmit).toHaveBeenCalledWith('早餐麦当劳25');
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
  });

  it('空输入时提交按钮禁用', () => {
    render(<Composer onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '提交' })).toHaveProperty('disabled', true);
  });

  it('提交进行中禁用按钮并显示提交中（防重复提交，§9）', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Composer onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), '早餐25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    const btn = await screen.findByRole('button', { name: '提交中…' });
    expect(btn).toHaveProperty('disabled', true);

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).toBeDefined());
  });

  it('提交失败时保留输入内容供用户重试', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox');
    await user.type(box, '早餐25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect((box as HTMLTextAreaElement).value).toBe('早餐25');
  });
});
