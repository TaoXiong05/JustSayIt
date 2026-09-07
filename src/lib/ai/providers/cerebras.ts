import Cerebras from '@cerebras/cerebras_cloud_sdk';
import {
  ALL_CATEGORIES,
  AiResponseSchema,
  type AiTransaction,
} from '@/lib/ai/schema';
import { buildSystemPrompt, type StructureContext } from '@/lib/ai/prompt';

const MODEL = 'qwen-3.8-27b';

/**
 * 输出上限。原来完全不设：模型一旦在 records 数组里打转，会一直生成到
 * 上下文耗尽——慢、烧运营者的钱，且最后 JSON 必然被截断，报出来的却是
 * "返回内容不是合法 JSON"，排查时指向完全错误的方向。
 * 25 条记录 × 每条约 60 token ≈ 1.5k，4096 留足富余又封住了失控。
 */
const MAX_COMPLETION_TOKENS = 4096;

/**
 * 一次输入能产出的记录条数上限。route 层放行 2000 字符（面向非浏览器
 * 调用方的防御性上限，浏览器侧 Composer 只让输入 80 字），一条正常的
 * 记账口述拆不出 25 笔；给 schema 加上这个约束，让"失控"在结构化输出
 * 这一层就被拦住，而不是靠 token 上限兜底后拿到半截 JSON。
 */
const MAX_RECORDS = 25;

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
      maxItems: MAX_RECORDS,
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
      max_completion_tokens: MAX_COMPLETION_TOKENS,
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

  const choice = (
    res as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    }
  )?.choices?.[0];

  // 因长度截断，和模型真返回了坏 JSON，是两件不同的事故：前者要调
  // MAX_COMPLETION_TOKENS/输入长度，后者要调 prompt 或换模型。不分开的话
  // 两者都报成"不是合法 JSON"，日志会把排查引向错误的方向。
  if (choice?.finish_reason === 'length') {
    throw new Error(`Cerebras 输出被长度上限截断（${MAX_COMPLETION_TOKENS} tokens）`);
  }

  const content = choice?.message?.content;
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
