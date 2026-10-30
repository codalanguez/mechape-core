export const MAX_SSE_LINE: number;
export function openRouterUsage(event: any): { promptTokens: number; completionTokens: number; cost: number | null } | null;
export function sseToNdjson(body: ReadableStream<Uint8Array>, options?: { onUsage?: (event: any) => unknown }): ReadableStream<Uint8Array>;
