export interface ChatPayload { model: string; messages: any[]; stream: boolean; usage?: { include: boolean }; provider?: { data_collection: string }; tools?: any[]; tool_choice?: string; [key: string]: unknown }
export function buildChatPayload(args: { model: string; messages: any[]; options?: Record<string, unknown>; dataCollection?: string }): ChatPayload;
export function headers(apiKey: string): Record<string, string>;
export function mapModel(model: any): any;
export function mapOptions(options?: Record<string, unknown>): Record<string, unknown>;
