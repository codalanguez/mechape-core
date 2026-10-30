export type Provider = 'ollama' | 'openrouter' | 'anthropic' | 'compatible';
export interface Connection { baseUrl: string; model: string; apiKey: string }
export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
export interface Message { role: 'user' | 'assistant' | 'tool'; content: string; calls?: ToolCall[]; callId?: string; name?: string; raw?: Record<string, unknown> }
export interface HttpRequest { url: string; method: string; headers: Record<string, string>; body?: string }
export type Transport = (request: HttpRequest, signal?: AbortSignal) => Promise<{ status: number; json: any }>;
export interface RequestOptions { options?: Record<string, any>; stream?: boolean; dataCollection?: string }
export function safeErrorData(text: string): { billing: boolean; toolsUnsupported?: boolean };
export function looksLikeNoToolSupport(status: number, text: string): boolean;
export function endpoint(base: string, path: string): string;
export function wireMessages(provider: Provider, messages: Message[]): any[];
export function fromWireMessages(messages: any[]): Message[];
export function makeRequest(provider: Provider, connection: Connection, system: string, messages: Message[], tools?: ToolDefinition[], options?: RequestOptions): HttpRequest;
export function makeWireRequest(provider: Provider, connection: Connection, messages: any[], tools?: any[], options?: RequestOptions): HttpRequest;
export function parseToolArguments(value: unknown): Record<string, unknown>;
export function parseResponse(provider: Provider, data: any): Message;
export function mapCompatibleOptions(options?: Record<string, unknown>): Record<string, unknown>;
export function send(transport: Transport, request: HttpRequest, signal: AbortSignal, timeoutMs?: number): Promise<any>;
export function fetchTransport(fetchImpl: typeof fetch): Transport;
export function listModels(provider: Provider, connection: Connection, transport: Transport, signal: AbortSignal): Promise<string[]>;
export interface WireOptions { provider: Provider; connection: Connection; messages: any[]; tools?: any[]; options?: Record<string, any>; dataCollection?: string; signal?: AbortSignal; timeoutMs?: number; fetch: typeof fetch }
export function completeWire(options: WireOptions): Promise<Message>;
export function streamWire(options: WireOptions): Promise<{ ok: true; status: number; body: ReadableStream<Uint8Array> }>;
