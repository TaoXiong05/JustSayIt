import Cerebras from '@cerebras/cerebras_cloud_sdk';
import {
  ALL_CATEGORIES,
  AiResponseSchema,
  type AiTransaction,
} from '@/lib/ai/schema';
import { buildSystemPrompt, type StructureContext } from '@/lib/ai/prompt';

const MODEL = 'qwen-3.8-27b';

/**
 * strict json_schema 模式的 schema 要求（spec §10.2b，沿用 Groq 时期的约定）：
 * 所有字段必须 required、对象必须 additionalProperties:false、
 * 可空字段用联合类型而非 nullable。已实测 Cerebras 的 qwen-3.8-27b 遵守此模式。
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

export async function cerebrasStructure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('缺少 CEREBRAS_API_KEY');

  const client = new Cerebras({ apiKey });

  let res: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: text },
      ],
      temperature: 0,
      // 关掉推理模型的思维链：这是提取任务，不需要——同 Groq 版本的
      // reasoning_effort:'none'，避免不必要的 reasoning token 拖慢响应。
      reasoning_effort: 'none',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'transactions', strict: true, schema: STRICT_SCHEMA },
      },
    });
  } catch (err) {
    // 只带状态码，绝不把用户输入或响应体写进错误信息（§10.5 零内容日志）
    const status = (err as { status?: number })?.status;
    throw new Error(`Cerebras 请求失败：HTTP ${status ?? '未知'}`);
  }

  const content = (res as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Cerebras 响应缺少 content 字段');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Cerebras 返回内容不是合法 JSON');
  }

  // 运行时校验是数据质量的最后防线（§10.4）——即使用了 structured output 也不跳过
  const parsed = AiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Cerebras 返回值未通过契约校验：${parsed.error.issues[0]?.message ?? '未知'}`);
  }
  return parsed.data.records;
}
