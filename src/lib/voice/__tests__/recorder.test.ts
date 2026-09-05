import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRecording, initializeRecorder, RecorderError } from '@/lib/voice/recorder';

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
  // jsdom 的默认测试 origin 不是安全上下文（isSecureContext 默认 false），
  // 这里显式钉成 true——这组用例测的是"MediaRecorder 存在与否""getUserMedia
  // 成功/失败"，不是安全上下文本身，钉死它才能把两件事分开测，不然所有用例
  // 都会在真正想测的检查之前就被 insecure-context 分支拦下。
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
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

  it('不支持 MediaRecorder 时抛 RecorderError(unsupported)', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const err = await startRecording().catch((e) => e);
    expect(err).toBeInstanceOf(RecorderError);
    expect((err as RecorderError).code).toBe('unsupported');
    expect((err as RecorderError).message).toMatch(/不支持/);
  });

  it('非安全上下文（HTTP 局域网访问等）时抛 RecorderError(insecure-context)，且不会碰 getUserMedia', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const err = await startRecording().catch((e) => e);
    expect(err).toBeInstanceOf(RecorderError);
    expect((err as RecorderError).code).toBe('insecure-context');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('用户拒绝麦克风权限时抛 RecorderError(permission-denied)', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    getUserMedia.mockRejectedValueOnce(denied);
    const err = await startRecording().catch((e) => e);
    expect(err).toBeInstanceOf(RecorderError);
    expect((err as RecorderError).code).toBe('permission-denied');
  });

  it('cancel() 显式停止 MediaRecorder，不只是停轨道后指望浏览器自动收尾', async () => {
    const handle = await startRecording();
    const recorderInstance = mediaRecorderCtor.mock.results[0].value as FakeMediaRecorder;
    expect(recorderInstance.state).toBe('recording');
    handle.cancel();
    expect(recorderInstance.state).toBe('inactive');
  });

  it('initializeRecorder 返回可 start 的工厂', async () => {
    const rec = initializeRecorder();
    expect(typeof rec.start).toBe('function');
    const handle = await rec.start();
    expect(handle.stop).toBeInstanceOf(Function);
    expect(handle.cancel).toBeInstanceOf(Function);
  });
});