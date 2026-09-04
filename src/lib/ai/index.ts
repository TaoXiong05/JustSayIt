import { cerebrasStructure } from '@/lib/ai/providers/cerebras';
import { groqTranscribe } from '@/lib/ai/providers/groq';
import type { StructureContext } from '@/lib/ai/prompt';
import type { AiTransaction } from '@/lib/ai/schema';

export type { StructureContext } from '@/lib/ai/prompt';

/**
 * 业务层唯一入口。
 * 换 provider 时只改这里的一行 import 与 providers/ 下的实现，
 * 调用方无需知道用的是哪家（spec §10.3）。
 * structure 走 Cerebras（qwen-3.8-27b），STT 仍走 Groq Whisper——两者可以
 * 各自独立换 provider，互不影响。
 */
export function structure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  return cerebrasStructure(text, ctx);
}

/** STT 窄接口（spec §9、§10.3）：业务层只见 Audio → Text */
export function transcribe(
  audio: Blob,
  vocab: string[],
): Promise<{ text: string }> {
  return groqTranscribe(audio, vocab);
}
