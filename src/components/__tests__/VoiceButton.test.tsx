import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { VoiceButton } from '@/components/VoiceButton';
import { initializeRecorder } from '@/lib/voice/recorder';

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
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ text: 'Woolworths 买菜' }) });
    vi.stubGlobal('fetch', fetchMock);
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /Record/ }));
    await waitFor(() => expect(currentRec).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith('Woolworths 买菜'));
    // 走 /api/stt 而非直接调用 provider（客户端不该碰服务端密钥），
    // 且商户词表偏置以 query string 形式带上
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/stt');
    expect(String(url)).toContain(encodeURIComponent('Woolworths'));
  });

  it('转写失败（无 code，如网络错误页）→ 显示通用错误文案且不回填', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /Record/ }));
    await waitFor(() => expect(currentRec).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe('Transcription failed, please retry');
    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it('转写失败带 QUOTA_EXCEEDED code → 显示配额超限的专门文案', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: '今日已达上限', code: 'QUOTA_EXCEEDED' }),
      }),
    );
    render(<VoiceButton onTranscribed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Record/ }));
    await waitFor(() => expect(currentRec).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Daily AI usage limit reached, please try again tomorrow',
      ),
    );
  });

  it('录音中可取消，不触发转写', async () => {
    const cancel = vi.fn();
    stubStart({ stop: vi.fn(), cancel });
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /Record/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancel/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(cancel).toHaveBeenCalled();
    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it('启动失败（不支持录音）→ 显示错误', async () => {
    vi.mocked(initializeRecorder).mockReturnValue({
      start: vi.fn().mockRejectedValue(new Error('no mic')),
    });
    render(<VoiceButton onTranscribed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Record/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});