import {
  AiResponseSchema,
  AI_STRICT_RESPONSE_FORMAT,
  type AiTransaction,
} from '@/lib/ai/schema';
import { buildSystemPrompt, type StructureContext } from '@/lib/ai/prompt';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'qwen/qwen3.8-27b';

/**
 * 限定只走这三家、且拒绝可能存储数据的供应商（spec §10.4b 要求接入任何
 * provider 前查证数据条款）。顺序即优先级、`allow_fallbacks:false`：
 * 三家都不可用就直接失败，绝不路由到列表之外的供应商——跟 §10.3
 * "不做 provider 间自动 fallback"的哲学一致。
 * 排序依据实测：CoreWeave 延迟最低最稳（~370ms，几乎不抖动），Parasail
 * 次之；Reka 排最后——在 temperature:0 下对同一输入两次给出了不同结果
 * （一次空、一次正确），确定性弱于另外两家，出问题时希望受影响的请求最少。
 */
const PROVIDER_ORDER = ['coreweave', 'parasail', 'reka'];
const ALLOW_FALLBACKS = false;
const DATA_COLLECTION = 'deny';

/** 同 Cerebras：封住模型在 records 数组里打转导致的失控输出。 */
const MAX_COMPLETION_TOKENS = 4096;

/**
 * 单次请求超时 + 429 退避重试，同 groq.ts：裸 fetch 没有任何默认超时，
 * OpenRouter 转发给第三方 GPU 云，稳定性不如 Cerebras 自家直连基础设施，
 * 上游一挂就能把 serverless 函数一路挂到平台上限。
 */
const REQUEST_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(body: unknown, apiKey: string): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) return res;
    lastStatus = res.status;
    if (res.status === 429 && attempt < 2) {
      await sleep(300 * 2 ** attempt); // 300ms / 600ms
      continue;
    }
    break;
  }
  // 只带状态码，绝不把请求/响应体写进错误信息（§10.5 零内容日志）
  throw new Error(`OpenRouter 请求失败：HTTP ${lastStatus}`);
}

export async function openrouterStructure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY');

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(ctx) },
      { role: 'user', content: text },
    ],
    temperature: 0,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'none',
    response_format: AI_STRICT_RESPONSE_FORMAT,
    provider: {
      order: PROVIDER_ORDER,
      allow_fallbacks: ALLOW_FALLBACKS,
      data_collection: DATA_COLLECTION,
    },
  };

  const res = await fetchWithRetry(body, apiKey);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  };
  const choice = json.choices?.[0];

  // 因长度截断，和模型真返回了坏 JSON，是两件不同的事故（同 cerebras.ts）
  if (choice?.finish_reason === 'length') {
    throw new Error(`OpenRouter 输出被长度上限截断（${MAX_COMPLETION_TOKENS} tokens）`);
  }

  const content = choice?.message?.content;
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
