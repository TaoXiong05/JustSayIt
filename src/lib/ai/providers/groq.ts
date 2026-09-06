// ---- STT（spec §16.6 选定参数；全部 provider 细节留在此文件）----

const TRANSCRIBE_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';
const VOCAB_TOKEN_CAP = 224;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Audio → Text（spec §9、§16.6）。
 * 固定：model=whisper-large-v3-turbo、temperature=0、response_format=verbose_json；
 * prompt=商户词表偏置（≤224 tokens）。
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

  const prompt = [...new Set(vocab)].join(', ').slice(0, VOCAB_TOKEN_CAP);

  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('file', audio, 'recording.webm');
  form.append('temperature', '0');
  form.append('response_format', 'verbose_json');
  if (prompt) form.append('prompt', prompt);

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
