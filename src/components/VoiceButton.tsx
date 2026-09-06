'use client';

import { Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { knownMerchants } from '@/lib/ledger/store';
import { initializeRecorder, RecorderError, DEFAULT_MAX_MS } from '@/lib/voice/recorder';
import type { RecorderHandle } from '@/lib/voice/recorder';
import { useLocale } from '@/lib/i18n/context';
import { errorCodeToKey, type DictKey } from '@/lib/i18n/dictionary';
import { ApiError, throwApiError } from '@/lib/apiError';

/** RecorderError.code → 文案 key。'unknown' 落到通用的 voiceUnsupported。 */
const RECORDER_ERROR_KEY: Record<RecorderError['code'], DictKey> = {
  'insecure-context': 'voiceInsecureContext',
  'permission-denied': 'voicePermissionDenied',
  unsupported: 'voiceUnsupported',
  unknown: 'voiceUnsupported',
};

/**
 * 走 /api/stt 而非直接 import provider（如 groqTranscribe）：
 * 后者读 GROQ_API_KEY，是服务端专属密钥，客户端 bundle 里永远是 undefined，
 * 直接调用只会在浏览器里必现失败，且绕开了服务端的认证与配额（§10.3、§11.5）。
 */
async function transcribeViaApi(audio: Blob, vocab: string[]): Promise<{ text: string }> {
  const qs = new URLSearchParams({ vocab: JSON.stringify(vocab) });
  const res = await fetch(`/api/stt?${qs.toString()}`, {
    method: 'POST',
    headers: { 'content-type': audio.type || 'audio/webm' },
    body: audio,
  });
  if (!res.ok) await throwApiError(res, `STT 请求失败：HTTP ${res.status}`);
  const data = (await res.json()) as { text?: unknown };
  if (typeof data.text !== 'string') throw new Error('STT 响应缺少 text 字段');
  return { text: data.text };
}

type Status = 'idle' | 'recording' | 'transcribing' | 'unsupported';

/** 每条声波竖线错开起伏的延迟，做出参差感（不是所有条同步跳动）。 */
const WAVE_BAR_DELAYS_MS = [0, 120, 240, 360, 180, 60];

/**
 * 空闲态两侧声波竖线的高度：从两端到按钮渐高，做出"声音从话筒散开"的
 * 层次感（左侧按此顺序排列，右侧镜像）。取代原来静止/扩散光环的空闲态
 * 动效——用户提供的参考图就是这个样子。
 */
const IDLE_WAVE_BAR_HEIGHTS_PX = [8, 13, 18];
const IDLE_WAVE_BAR_DELAYS_MS = [0, 200, 400];

/**
 * 语音输入按钮：录音 → STT → 回填（spec §9）。
 * STT 只负责 Audio → Text；回填后由用户确认，走 Plan 1 既有提交管线。
 * 状态机：idle → recording（可停止/取消）→ transcribing → 回填 / 错误。
 */
export function VoiceButton({
  onTranscribed,
}: {
  onTranscribed: (text: string) => void;
}) {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const [remainingMs, setRemainingMs] = useState(DEFAULT_MAX_MS);

  // 录音上限的倒计时。按"开始时刻 + 当前时刻"算剩余，而不是每次 tick 自减：
  // setInterval 本身有漂移，页面切到后台时还会被浏览器降频，自减会越走越
  // 偏，跟录音器那个真正决定何时停的 setTimeout 对不上。上限值直接取
  // recorder.ts 的 DEFAULT_MAX_MS，两边不会各写一个数字然后走散。
  useEffect(() => {
    if (status !== 'recording') return;
    const startedAt = Date.now();
    setRemainingMs(DEFAULT_MAX_MS);
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, DEFAULT_MAX_MS - (Date.now() - startedAt)));
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  async function start() {
    setError(null);
    try {
      // 录满上限（recorder.ts 的 DEFAULT_MAX_MS）时录音器会自己停下来，
      // 但只有接上这个回调，组件才知道该离开录音态、照常去转写——否则
      // 界面会一直停在"录音中"，上限对用户等于不存在。
      const recorder = initializeRecorder({ onAutoStop: () => void stop() });
      recorderRef.current = await recorder.start();
      setStatus('recording');
    } catch (err) {
      setStatus('unsupported');
      const key = err instanceof RecorderError ? RECORDER_ERROR_KEY[err.code] : 'voiceUnsupported';
      setError(t(key));
    }
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setStatus('transcribing');
    try {
      const { blob, hadSound } = await rec.stop();
      // 全程没检测到声音（用户点了麦克风但什么都没说）：不发 STT 请求，
      // 省一次注定拿不到有效结果的 AI 调用（用户反馈原话）。
      if (!hadSound) {
        setError(t('voiceNoSoundDetected'));
        setStatus('idle');
        return;
      }
      // 商户词表偏置（§16.3）：历史出现过写法的商户更容易被听对
      const vocab = knownMerchants();
      const { text } = await transcribeViaApi(blob, vocab);
      onTranscribed(text);
      setStatus('idle');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(errorCodeToKey(code, 'errorTranscribeFailed')));
      setStatus('idle');
    }
  }

  function cancel() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setStatus('idle');
  }

  // 录音态：图标原地放大 + 声波动画。取消按钮放在旁边，不清空转写结果直接丢弃。
  if (status === 'recording') {
    return (
      // 移动端用 fixed 悬浮层：Composer 卡片本身是定高（42dvh）、内部
      // overflow-y-auto 的容器，录音态内容一旦比这块可用空间高就会被
      // 裁切/挤压——用户反馈原话"不要让它被遮挡"。fixed + z-50（盖过
      // BottomNav 的 z-40）让录音 UI 悬浮在整个页面之上，不再受 Composer
      // 卡片自身高度的约束。桌面端 Composer 高度宽松（h-96），lg: 还原回
      // 原来嵌在卡片里的居中布局，不需要悬浮。
      //
      // items-end + pb-10：整栈锚在屏幕底部，而不是垂直居中——拇指够得到
      // 的范围本来就是相对屏幕底边的，锚底边在各种屏幕高度上都成立，不用
      // 维护一串跟 Composer 高度耦合的百分比计算（用户要求：红色麦克风
      // 下移到最好操作的位置）。盖住底部 tab 栏是有意的：录音期间不该误触导航。
      //
      // bg-bg/40 + backdrop-blur-md：底色只留一层薄压暗，保证红色麦克风和
      // 文案在任意背景上都读得清，主要靠模糊做出毛玻璃感——原来是 bg-bg/80，
      // 等于把下面盖死了，模糊反而看不出来（用户反馈："不要现在这种完全
      // 不透明的感觉"）。
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/40 pb-10 backdrop-blur-md lg:static lg:inset-auto lg:z-auto lg:items-center lg:bg-transparent lg:pb-0 lg:backdrop-blur-none">
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => void stop()}
            aria-label={t('voiceStop')}
            title={t('voiceStop')}
            className="relative flex size-20 items-center justify-center rounded-full bg-danger text-white shadow-pop [clip-path:circle(50%)] lg:size-24"
          >
            {/* ping 波纹圈：跟下面的竖线声波是两种视觉语言的同一个意思——
                "正在录音"，圈负责外围的呼吸感，竖线负责"像声音在跳动"。 */}
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/50" />
            <Mic aria-hidden="true" className="relative size-8 lg:size-9" />
          </button>
          <div className="flex h-5 items-end gap-1" aria-hidden="true">
            {WAVE_BAR_DELAYS_MS.map((delay, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-danger [animation:voice-wave_0.9s_ease-in-out_infinite]"
                style={{ height: '18px', animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
          {/* 倒计时单独放在一个 aria-hidden 的元素里，不塞进上面那个
              aria-live 区域——那样读屏器会每秒播报一次剩余秒数。文案本身
              只在进入录音态时播报一次就够了。
              font-mono + tabular-nums：数字等宽，秒数变化时这一行不会抖。 */}
          <div className="flex items-baseline gap-1.5">
            <span aria-live="polite" className="text-xs font-medium text-danger">
              {t('voiceRecording')}
            </span>
            <span
              aria-hidden="true"
              className="font-mono text-xs font-semibold tabular-nums text-danger"
            >
              {Math.ceil(remainingMs / 1000)}s
            </span>
          </div>
          {/* 取消从"大圆左边的 X 图标"改成"大圆下方一个带文案的胶囊"：
              按钮的可点击范围是它的方形包围盒、不是看起来的圆形，紧挨大圆
              的小 X 很容易在瞄准时把触点落进麦克风热区（用户反馈"点 X 还是
              回填到输入框"最可能的成因）。改成垂直方向分开的宽胶囊之后这个
              隐患自然消失；mt-2 额外拉开间距，py-3 保证约 44px 的可靠点按高度。 */}
          <button
            type="button"
            onClick={cancel}
            className="mt-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            {t('voiceCancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* 两侧声波竖线（参考设计的关键细节）：只在真正空闲（能点击开始
          录音）时跳动，邀请用户点击——转写中按钮是禁用状态，继续播"邀请
          点击"的动画会自相矛盾，那时两侧竖线收起，只留静止的按钮。
          空闲态不再显示文字说明（原来"Record"），靠标题区的文案 + 按钮
          自带的 aria-label 提供上下文/无障碍名，视觉上更干净。转写态保留
          文字，那是一个需要用户等待的过程，光看一个转圈图标不够明确。 */}
      <div className="flex items-center gap-2.5">
        {status === 'idle' &&
          IDLE_WAVE_BAR_HEIGHTS_PX.map((h, i) => (
            <span
              key={`l${i}`}
              aria-hidden="true"
              className="w-1 shrink-0 rounded-full bg-brand-soft [animation:voice-wave_1.2s_ease-in-out_infinite]"
              style={{ height: `${h}px`, animationDelay: `${IDLE_WAVE_BAR_DELAYS_MS[i]}ms` }}
            />
          ))}
        {/* 用户反馈桌面/移动尺寸对调后移动端还是偏大——再收一档（size-16→
            size-14），桌面端（Composer 是宽松的 h-96）维持 lg:size-20。 */}
        <button
          type="button"
          onClick={() => void start()}
          disabled={status === 'transcribing'}
          aria-label={status === 'transcribing' ? t('voiceTranscribing') : t('voiceStart')}
          title={status === 'transcribing' ? t('voiceTranscribing') : t('voiceStart')}
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink shadow-pop transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 [clip-path:circle(50%)] lg:size-20"
        >
          {status === 'transcribing' ? (
            <span
              aria-hidden="true"
              className="size-5 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink lg:size-8"
            />
          ) : (
            // 原 emoji（🎤）拆成纯文本字典 + 独立 Mic 图标（Global Constraint 9）——
            // 字典字符串承载不了 React 组件。
            <Mic aria-hidden="true" className="size-6 lg:size-8" />
          )}
        </button>
        {status === 'idle' &&
          [...IDLE_WAVE_BAR_HEIGHTS_PX].reverse().map((h, i) => (
            <span
              key={`r${i}`}
              aria-hidden="true"
              className="w-1 shrink-0 rounded-full bg-brand-soft [animation:voice-wave_1.2s_ease-in-out_infinite]"
              style={{
                height: `${h}px`,
                animationDelay: `${[...IDLE_WAVE_BAR_DELAYS_MS].reverse()[i]}ms`,
              }}
            />
          ))}
      </div>
      {status === 'transcribing' && (
        <span className="text-xs font-medium text-muted">{t('voiceTranscribing')}</span>
      )}
      {error && (
        <span role="alert" className="max-w-[220px] text-center text-sm font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  );
}