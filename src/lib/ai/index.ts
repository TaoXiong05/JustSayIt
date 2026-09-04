import { groqStructure } from '@/lib/ai/providers/groq';
import type { StructureContext } from '@/lib/ai/prompt';
import type { AiTransaction } from '@/lib/ai/schema';

export type { StructureContext } from '@/lib/ai/prompt';

/**
 * 业务层唯一入口。
 * 换 provider 时只改这里的一行 import 与 providers/ 下的实现，
 * 调用方无需知道用的是哪家（spec §10.3）。
 */
export function structure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  return groqStructure(text, ctx);
}
