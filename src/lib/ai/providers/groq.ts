// ---- STT（spec §16.6 选定参数；全部 provider 细节留在此文件）----

const TRANSCRIBE_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';
const VOCAB_TOKEN_CAP = 224;

/**
 * 数字写法的风格样例。Whisper 的 prompt 不是"指令"，是**上文**——它模仿
 * prompt 的书写风格，所以想让它输出 "65" 而不是 "sixty five"，最有效的
 * 办法是给它一段本身就用阿拉伯数字的上文。中英各给一句：说话语言可能是
 * 中文/英文/中英混合，不传 language 就不能只押一边（见下方注释）。
 * 刻意不含任何品牌名——prompt 里出现的词会被偏置，不该凭空提高某个商户
 * 被听成的概率，那是 vocab 该负责的事。
 */
const NUMERAL_STYLE_HINT = '午餐 65，咖啡 12.50。lunch 65, coffee 12.50.';

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Audio → Text（spec §9、§16.6）。
 * 固定：model=whisper-large-v3-turbo、temperature=0、response_format=verbose_json；
 * prompt=数字写法样例 + 商户词表偏置（≤224 tokens）。
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

  const merchants = [...new Set(vocab)].join(', ').slice(0, VOCAB_TOKEN_CAP);
  const prompt = merchants ? `${NUMERAL_STYLE_HINT} ${merchants}` : NUMERAL_STYLE_HINT;

  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('file', audio, fileNameFor(audio.type));
  form.append('temperature', '0');
  form.append('response_format', 'verbose_json');
  form.append('prompt', prompt);

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(TRANSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
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
