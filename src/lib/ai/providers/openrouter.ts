import {
  ALL_CATEGORIES,
  AiResponseSchema,
  type AiTransaction,
} from '@/lib/ai/schema';
import { buildSystemPrompt, type StructureContext } from '@/lib/ai/prompt';

const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const STRUCTURE_MODEL = 'deepseek/deepseek-v4-flash-0731';

/**
 * strict json_schema 模式的 schema 要求（spec §10.2b，沿用 Groq 时期的约定）：
 * 所有字段必须 required、对象必须 additionalProperties:false、
 * 可空字段用联合类型而非 nullable。已实测 deepseek-v4-flash-0731 遵守此模式。
 */
const STRICT_SCHEMA = {
  type: 'object',
  properties: {
    records: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['EXPENSE', 'INCOME'] },
          amount: { type: 'number' },
          currency: { type: ['string', 'null'] },
          date: { type: 'string' },
          category: { type: 'string', enum: [...ALL_CATEGORIES] },
          merchant: { type: ['string', 'null'] },
          description: { type: 'string' },
        },
        required: ['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['records'],
  additionalProperties: false,
} as const;

export async function openrouterStructure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY');

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: STRUCTURE_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: text },
      ],
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'transactions', strict: true, schema: STRICT_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    // 只带状态码，绝不把用户输入或响应体写进错误信息（§10.5 零内容日志）
    throw new Error(`OpenRouter 请求失败：HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // 外层信封解析失败（代理/网关错误页、响应被截断等）——不带响应体片段
    throw new Error('OpenRouter 响应格式异常');
  }

  const content = (json as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter 响应缺少 content 字段');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('OpenRouter 返回内容不是合法 JSON');
  }

  // 运行时校验是数据质量的最后防线（§10.4）——即使用了 structured output 也不跳过
  const parsed = AiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`OpenRouter 返回值未通过契约校验：${parsed.error.issues[0]?.message ?? '未知'}`);
  }
  return parsed.data.records;
}
// ---- STT（spec §16.6 选定参数；全部 provider 细节留在此文件）----

const TRANSCRIBE_ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions';
const TRANSCRIBE_MODEL = 'openai/whisper-large-v3';
const VOCAB_TOKEN_CAP = 224;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Audio → Text（spec §9、§16.6）。
 * 固定：model=openai/whisper-large-v3、language=zh、temperature=0、
 * response_format=verbose_json；prompt=商户词表偏置（≤224 tokens）。
 * 429 时指数退避重试（§10.3a：限流是常态而非异常），最多 3 次。
 */
export async function openrouterTranscribe(
  audio: Blob,
  vocab: string[],
): Promise<{ text: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY');

  const prompt = [...new Set(vocab)].join(', ').slice(0, VOCAB_TOKEN_CAP);

  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('file', audio, 'recording.webm');
  form.append('language', 'zh');
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
        throw new Error('OpenRouter 返回缺少 text 字段');
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
  throw new Error(`OpenRouter 转写失败：HTTP ${lastStatus}`);
}
