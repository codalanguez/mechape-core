import type { Message, ToolCall, ToolDefinition } from './providers';
export interface AgentEvent { type: 'request' | 'tool_start' | 'tool_done' | 'tool_budget' | 'tool_unsupported'; round?: number; call?: ToolCall; allowed?: boolean; content?: string }
export interface AgentOptions {
  messages: Message[]; definitions?: ToolDefinition[]; signal: AbortSignal;
  request(messages: Message[], definitions: ToolDefinition[], signal: AbortSignal): Promise<Message>;
  execute(call: ToolCall, signal: AbortSignal): Promise<string>;
  onText?(text: string): Promise<void>; onEvent?(event: AgentEvent): void;
  maxRounds?: number; maxCalls?: number; maxHistoryChars?: number;
  prepareForStream?: boolean;
}
export function runAgent(options: AgentOptions): Promise<Message[]>;
