import { cerebrasStructure } from '@/lib/ai/providers/cerebras';
import { openrouterStructure } from '@/lib/ai/providers/openrouter';
import { groqTranscribe } from '@/lib/ai/providers/groq';
import type { StructureContext } from '@/lib/ai/prompt';
import type { AiTransaction } from '@/lib/ai/schema';

export type { StructureContext } from '@/lib/ai/prompt';

/**
 * 运维手动切换 structure 走哪家（不做运行时自动 failover，跟 §10.3 一致）。
 * 未设置时默认 CEREBRAS；设了但不是这两个精确值之一（含拼错）直接抛错，
 * 不当成"没设置"静默兜底——避免"以为切到了 OpenRouter，实际上全程还在
 * 跑 Cerebras"这种不会报错、只能靠运气发现的故障。
 */
function resolveStructureProvider(): 'CEREBRAS' | 'OPENROUTER' {
  const raw = process.env.AI_STRUCTURE_PROVIDER;
  if (!raw) return 'CEREBRAS';
  if (raw === 'CEREBRAS' || raw === 'OPENROUTER') return raw;
  throw new Error(`AI_STRUCTURE_PROVIDER 配置错误：得到 "${raw}"，必须是 CEREBRAS 或 OPENROUTER`);
}

/**
 * 业务层唯一入口。
 * structure 可在 Cerebras（qwen-3.8-27b）与 OpenRouter（qwen/qwen3.8-27b，
 * 限定 coreweave/parasail/reka 三家）间用 AI_STRUCTURE_PROVIDER 手动切换；
 * STT 仍走 Groq Whisper——两者各自独立换 provider，互不影响。
 * provider 细节全部封在各自适配器里，调用方无需知道用的是哪家（spec §10.3）。
 */
export async function structure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  return resolveStructureProvider() === 'OPENROUTER'
    ? openrouterStructure(text, ctx)
    : cerebrasStructure(text, ctx);
}

/** STT 窄接口（spec §9、§10.3）：业务层只见 Audio → Text */
export function transcribe(
  audio: Blob,
  vocab: string[],
): Promise<{ text: string }> {
  return groqTranscribe(audio, vocab);
}
