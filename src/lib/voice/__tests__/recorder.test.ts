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

/**
 * 受控的假 AnalyserNode：测试用例通过给 `nextData` 赋值来决定下一次
 * `getByteTimeDomainData` 该填什么样的采样（静音=全 128，有声=有偏离）。
 */
class FakeAnalyser {
  fftSize = 2048;
  frequencyBinCount = 1024;
  nextData: number[] | null = null;
  getByteTimeDomainData(arr: Uint8Array) {
    const src = this.nextData ?? new Array(arr.length).fill(128);
    for (let i = 0; i < arr.length; i++) arr[i] = src[i % src.length];
  }
}

let fakeAnalyser: FakeAnalyser;
const audioContextCtor = vi.fn().mockImplementation(function F() {
  fakeAnalyser = new FakeAnalyser();
  return {
    createMediaStreamSource: () => ({ connect: vi.fn() }),
    createAnalyser: () => fakeAnalyser,
    close: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', mediaRecorderCtor);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', audioContextCtor);
  // jsdom 的默认测试 origin 不是安全上下文（isSecureContext 默认 false），
  // 这里显式钉成 true——这组用例测的是"MediaRecorder 存在与否""getUserMedia
  // 成功/失败"，不是安全上下文本身，钉死它才能把两件事分开测，不然所有用例
  // 都会在真正想测的检查之前就被 insecure-context 分支拦下。
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('startRecording', () => {
  it('请求麦克风并启动 MediaRecorder', async () => {
    await startRecording();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mediaRecorderCtor).toHaveBeenCalledTimes(1);
  });

  it('stop() 返回拼接的 Blob 与 hadSound 标记', async () => {
    const handle = await startRecording();
    const { blob, hadSound } = await handle.stop();
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBeGreaterThan(0);
    expect(typeof hadSound).toBe('boolean');
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

  describe('静音检测（hadSound）', () => {
    it('全程静音（采样一直落在中点附近）时 hadSound 为 false', async () => {
      vi.useFakeTimers();
      const handle = await startRecording();
      fakeAnalyser.nextData = new Array(1024).fill(128); // 静音：时域采样钉在中点
      await vi.advanceTimersByTimeAsync(500);
      const { hadSound } = await handle.stop();
      expect(hadSound).toBe(false);
    });

    it('录音期间任意一刻音量超过阈值，hadSound 就变为 true（哪怕之后又安静下来）', async () => {
      vi.useFakeTimers();
      const handle = await startRecording();
      fakeAnalyser.nextData = new Array(1024).fill(128);
      await vi.advanceTimersByTimeAsync(200);
      // 中途说了一句话：采样明显偏离中点
      fakeAnalyser.nextData = [40, 210, 30, 220];
      await vi.advanceTimersByTimeAsync(200);
      fakeAnalyser.nextData = new Array(1024).fill(128); // 说完又安静下来
      await vi.advanceTimersByTimeAsync(200);
      const { hadSound } = await handle.stop();
      expect(hadSound).toBe(true);
    });

    it('当前环境没有 AudioContext（不支持静音检测）时，安全默认为 hadSound=true，不阻断正常发送', async () => {
      vi.stubGlobal('AudioContext', undefined);
      const handle = await startRecording();
      const { hadSound } = await handle.stop();
      expect(hadSound).toBe(true);
    });
  });
});