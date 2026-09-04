import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceButton } from '@/components/VoiceButton';
import { transcribe } from '@/lib/ai';
import { initializeRecorder } from '@/lib/voice/recorder';

vi.mock('@/lib/ai', () => ({ transcribe: vi.fn() }));
vi.mock('@/lib/ledger/store', () => ({ knownMerchants: vi.fn(() => ['Woolworths']) }));
vi.mock('@/lib/voice/recorder', () => ({ initializeRecorder: vi.fn() }));

type Rec = { stop(): Promise<Blob>; cancel(): void };
let currentRec: Rec | null;

function stubStart(rec: Rec) {
  vi.mocked(initializeRecorder).mockReturnValue({
    start: vi.fn().mockResolvedValue((currentRec = rec)),
  });
}

beforeEach(() => {
  currentRec = null;
  vi.clearAllMocks();
  stubStart({ stop: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' })), cancel: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('VoiceButton', () => {
  it('录音结束 → 转写 → 回填 onTranscribed', async () => {
    vi.mocked(transcribe).mockResolvedValue({ text: 'Woolworths 买菜' });
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(currentRec).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /停止/ }));
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith('Woolworths 买菜'));
    expect(vi.mocked(transcribe).mock.calls[0][1]).toEqual(['Woolworths']);
  });

  it('转写失败 → 显示错误且不回填', async () => {
    vi.mocked(transcribe).mockRejectedValue(new Error('boom'));
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(currentRec).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /停止/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it('录音中可取消，不触发转写', async () => {
    const cancel = vi.fn();
    stubStart({ stop: vi.fn(), cancel });
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /取消/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /取消/ }));
    expect(cancel).toHaveBeenCalled();
    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it('启动失败（不支持录音）→ 显示错误', async () => {
    vi.mocked(initializeRecorder).mockReturnValue({
      start: vi.fn().mockRejectedValue(new Error('no mic')),
    });
    render(<VoiceButton onTranscribed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});