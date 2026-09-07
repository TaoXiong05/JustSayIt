// ---- STT（spec §16.6 选定参数；全部 provider 细节留在此文件）----

const TRANSCRIBE_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';
/**
 * Whisper 的 prompt 上限是 **224 token**，超出部分被丢弃的是**开头**
 * （whisper 取 initial prompt 的最后 223 个 token）。这里按字符做保守折算：
 * 英文 224 字符远不到 224 token，中文商户名可能接近 1:1，取 224 字符两边
 * 都不会超。名字如实叫 CHAR，不再叫 TOKEN——原来的 VOCAB_TOKEN_CAP 用
 * `.slice()` 切的是字符却写作 token，单位对不上就没法判断这个上限到底
 * 是紧是松。
 */
const PROMPT_CHAR_BUDGET = 224;

/**
 * 数字写法的风格样例。Whisper 的 prompt 不是"指令"，是**上文**——它模仿
 * 上文的书写风格，所以想让它输出 "65" 而不是 "sixty five"，最有效的办法
 * 是给它一段本身就用阿拉伯数字的上文。
 *
 * 刻意只有数字、不带任何自然语言词：
 * - 代码不传 language，靠 Whisper 从音频自动识别说话语言（见下方注释）。
 *   样例里一旦出现中文或英文词，就等于给纯英文/纯中文的口述掺进另一种
 *   语言的上文，有把输出带偏（码字混排、标点串味）的风险。
 * - 也不含任何品牌名：prompt 里出现的词会被偏置，凭空提高某个商户被听成
 *   的概率是 vocab 的职责，不该由风格样例夹带。
 */
const NUMERAL_STYLE_HINT = '65, 12.50, 4.8';

/**
 * 组装 prompt：商户词表在前、数字样例在后，整串不超过 PROMPT_CHAR_BUDGET。
 *
 * 两个关键点：
 * 1. 样例放**最后**。Whisper 超长时丢的是开头，样例放开头的话，词表越长
 *    它越先被丢掉——恰好在最该起作用的场景失效。
 * 2. 词表按 ", " 的**整条边界**截断，不从中间切。原来直接
 *    `join(', ').slice(0, N)` 会切出 "Woolwo" 这种不存在的词，等于给
 *    Whisper 一个错误的偏置，比不给还糟。
 *
 * 入参 vocab 由调用方按"越靠前越相关"排好（见 VoiceButton），这里从前往后取。
 */
function buildPrompt(vocab: string[]): string {
  const budget = PROMPT_CHAR_BUDGET - NUMERAL_STYLE_HINT.length;
  const picked: string[] = [];
  let used = 0;
  for (const name of new Set(vocab)) {
    const cost = name.length + 2; // ", " 分隔符
    if (used + cost > budget) break;
    picked.push(name);
    used += cost;
  }
  return [...picked, NUMERAL_STYLE_HINT].join(', ');
}

/**
 * 上传文件名的扩展名要跟真实容器对上：Whisper 端按扩展名挑解码路径，而
 * MediaRecorder 的默认输出是**平台相关**的——桌面 Chrome 给 WebM/Opus，
 * iOS Safari 给 MP4/AAC。原来无论如何都写死 recording.webm，等于把 iOS
 * 的 MP4 谎报成 WebM。
 */
function fileNameFor(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  const ext =
    base === 'audio/mp4' || base === 'audio/aac' || base === 'audio/x-m4a'
      ? 'm4a'
      : base === 'audio/mpeg'
        ? 'mp3'
        : base === 'audio/ogg'
          ? 'ogg'
          : base === 'audio/wav' || base === 'audio/x-wav'
            ? 'wav'
            : 'webm';
  return `recording.${ext}`;
}

/**
 * 单次请求超时。裸 fetch 没有任何默认超时，配合下面 3 次重试，上游一挂
 * 就能把 serverless 函数一路挂到平台上限。客户端录音上限是 30s，
 * whisper-large-v3-turbo 处理这个长度远用不到 20s。
 */
const REQUEST_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Audio → Text（spec §9、§16.6）。
 * 固定：model=whisper-large-v3-turbo、temperature=0、response_format=verbose_json；
 * prompt=商户词表偏置 + 数字写法样例（见 buildPrompt）。
 * 不传 language：用户语音可能是中文/英文/中英混合，UI locale 不等于说话语言，
 * 不能用其中之一替代另一个（中英文支持要求 §2、§3）——交给 Whisper 自动识别。
 * 429 时指数退避重试（§10.3a：限流是常态而非异常），最多 3 次。
 */
export async function groqTranscribe(
  audio: Blob,
  vocab: string[],
): Promise<{ text: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('缺少 GROQ_API_KEY');

  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('file', audio, fileNameFor(audio.type));
  form.append('temperature', '0');
  form.append('response_format', 'verbose_json');
  form.append('prompt', buildPrompt(vocab));

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(TRANSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) {
      const json = (await res.json()) as { text?: unknown };
      if (typeof json.text !== 'string') {
        throw new Error('Groq 返回缺少 text 字段');
      }
      return { text: json.text };
    }
    lastStatus = res.status;
    if (res.status === 429 && attempt < 2) {
      await sleep(300 * 2 ** attempt); // 300ms / 600ms
      continue;
    }
    break;
  }
  // 不带响应体，零内容日志（§10.5）
  throw new Error(`Groq 转写失败：HTTP ${lastStatus}`);
}
