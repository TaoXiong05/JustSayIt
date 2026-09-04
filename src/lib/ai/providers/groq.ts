import {
  ALL_CATEGORIES,
  AiResponseSchema,
  type AiTransaction,
} from '@/lib/ai/schema';
import { buildSystemPrompt, type StructureContext } from '@/lib/ai/prompt';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'qwen/qwen3.8-27b';

/**
 * Groq strict 模式的 schema 要求（spec §10.2b）：
 * 所有字段必须 required、对象必须 additionalProperties:false、
 * 可空字段用联合类型而非 nullable。
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

export async function groqStructure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('缺少 GROQ_API_KEY');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: text },
      ],
      temperature: 0,
      reasoning_effort: 'none',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'transactions', strict: true, schema: STRICT_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    // 只带状态码，绝不把用户输入或响应体写进错误信息（§10.5 零内容日志）
    throw new Error(`Groq 请求失败：HTTP ${res.status}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Groq 返回内容不是合法 JSON');
  }

  // 运行时校验是数据质量的最后防线（§10.4）——即使用了 structured output 也不跳过
  const parsed = AiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Groq 返回值未通过契约校验：${parsed.error.issues[0]?.message ?? '未知'}`);
  }
  return parsed.data.records;
}
