/** 携带服务端 error code 的 Error——UI 层据此选择本地化文案，不解析消息文本。 */
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 从失败的 Response 里取出 { error, code }，包成 ApiError 抛出。
 * body 不是合法 JSON（网关错误页等）时退回 fallbackMessage，不带 code。
 */
export async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof body.code === 'string') code = body.code;
  } catch {
    // 忽略——用 fallback
  }
  throw new ApiError(fallbackMessage, code);
}
