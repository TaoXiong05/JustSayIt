import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRecording, initializeRecorder } from '@/lib/voice/recorder';

class FakeMediaRecorder {
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const mediaRecorderCtor = vi
  .fn()
  .mockImplementation(function F() {
    return new FakeMediaRecorder();
  });
const getUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [{ stop: vi.fn() }],
});

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', mediaRecorderCtor);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startRecording', () => {
  it('请求麦克风并启动 MediaRecorder', async () => {
    await startRecording();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mediaRecorderCtor).toHaveBeenCalledTimes(1);
  });

  it('stop() 返回拼接的 Blob', async () => {
    const handle = await startRecording();
    const blob = await handle.stop();
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('不支持 MediaRecorder 时抛错', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(startRecording()).rejects.toThrow(/不支持/);
  });

  it('initializeRecorder 返回可 start 的工厂', async () => {
    const rec = initializeRecorder();
    expect(typeof rec.start).toBe('function');
    const handle = await rec.start();
    expect(handle.stop).toBeInstanceOf(Function);
    expect(handle.cancel).toBeInstanceOf(Function);
  });
});