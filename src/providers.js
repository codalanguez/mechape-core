// Shared provider protocol adapters. Host applications supply transport and credentials.
const openrouter = require('./openrouter');
const { sseToNdjson, openRouterUsage } = require('./stream');
const PROVIDERS = ['ollama', 'openrouter', 'anthropic', 'compatible'];
function looksLikeNoToolSupport(status, text) {
  return [400, 404, 422].includes(status) && /(?:not support|unsupported|no endpoints).*?(?:tool|function[ _-]?call)|(?:tool|function[ _-]?call).*?(?:not support|unsupported)/i.test(text || '');
}
function safeErrorData(text) {
  let message = '';
  try { const error = JSON.parse(text)?.error; message = typeof error?.message === 'string' ? error.message : typeof error === 'string' ? error : ''; } catch { /* no arbitrary response text */ }
  const result = { billing: /credit balance is too low|insufficient credits|insufficient_quota/i.test(message) };
  if (looksLikeNoToolSupport(400, message)) result.toolsUnsupported = true;
  return result;
}
function endpoint(base, suffix) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) API base URL without credentials, query, or fragment.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote API endpoints must use HTTPS.');
  return base.replace(/\/+$/, '') + suffix;
}
function validate(provider, connection, needsModel = true) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unknown provider.');
  if (needsModel && !connection.model?.trim()) throw new Error('Choose a model in MechApe settings first.');
  if (['anthropic', 'openrouter'].includes(provider) && !connection.apiKey?.trim()) throw new Error('Add your API key in MechApe settings.');
}
function wireMessages(provider, messages) {
  if (provider === 'anthropic') {
    const output = [];
    for (const message of messages) {
      const role = message.role === 'tool' ? 'user' : message.role;
      const content = message.role === 'tool' ? [{ type: 'tool_result', tool_use_id: message.callId, content: message.content }]
        : structuredClone(message.raw?.content ?? [{ type: 'text', text: message.content }]);
      if (output.at(-1)?.role === role) output.at(-1).content.push(...content);
      else output.push({ role, content });
    }
    return output;
  }
  return messages.map(message => {
    if (message.role === 'assistant' && message.raw) return structuredClone(message.raw);
    if (message.role === 'tool') return provider === 'ollama'
      ? { role: 'tool', content: message.content, tool_name: message.name }
      : { role: 'tool', content: message.content, tool_call_id: message.callId };
    return { role: message.role, content: message.content };
  });
}
function mapCompatibleOptions(options = {}) {
  const result = openrouter.mapOptions(options);
  delete result.repetition_penalty;
  if (options.repeat_penalty != null) result.repeat_penalty = options.repeat_penalty;
  for (const key of ['repeat_last_n', 'mirostat', 'mirostat_eta', 'mirostat_tau']) if (options[key] != null) result[key] = options[key];
  return result;
}
function makeRequest(provider, connection, system, messages, tools = [], { options = { num_predict: 4096 }, stream = false, dataCollection = 'deny' } = {}) {
  validate(provider, connection);
  const headers = { 'Content-Type': 'application/json' };
  let body, suffix;
  if (provider === 'anthropic') {
    Object.assign(headers, { 'x-api-key': connection.apiKey, 'anthropic-version': '2023-06-01' });
    suffix = '/messages';
    body = { model: connection.model, max_tokens: options.num_predict > 0 ? options.num_predict : 4096, system, messages: wireMessages(provider, messages) };
    for (const key of ['temperature', 'top_p', 'top_k']) if (options[key] != null) body[key] = options[key];
    if (stream) body.stream = true;
    if (tools.length) body.tools = tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
  } else {
    if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
    suffix = provider === 'ollama' ? '/api/chat' : '/chat/completions';
    const wire = [...(system ? [{ role: 'system', content: system }] : []), ...wireMessages(provider, messages)];
    body = { model: connection.model, stream, messages: wire };
    if (provider === 'openrouter') {
      Object.assign(headers, openrouter.headers(connection.apiKey));
      body = openrouter.buildChatPayload({ model: connection.model, messages: wire, options, dataCollection });
      body.stream = stream;
      if (!stream) delete body.usage;
    } else if (provider === 'ollama') body.options = options;
    else Object.assign(body, mapCompatibleOptions(options));
    if (tools.length) {
      body.tools = tools.map(tool => ({ type: 'function', function: tool }));
      if (provider !== 'ollama') body.tool_choice = 'auto';
    }
  }
  return { url: endpoint(connection.baseUrl, suffix), method: 'POST', headers, body: JSON.stringify(body) };
}
function parseToolArguments(value) {
  let args = value;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { throw new Error('The model returned invalid tool arguments. Try again or choose a tool-capable model.'); } }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('The model returned invalid tool arguments.');
  return args;
}
function parseResponse(provider, data) {
  const raw = provider === 'anthropic' ? { role: 'assistant', content: data?.content } : provider === 'ollama' ? data?.message : data?.choices?.[0]?.message;
  if (!raw || raw.role !== 'assistant') throw new Error('The provider returned no assistant message. Check the endpoint and model.');
  if (data.stop_reason === 'max_tokens' || data.choices?.[0]?.finish_reason === 'length' || data.done_reason === 'length') throw new Error('The model hit its output limit. Ask for a smaller change; no incomplete tool calls were applied.');
  if (provider === 'anthropic' && !Array.isArray(data.content)) throw new Error('The provider returned invalid content.');
  const content = provider === 'anthropic' ? data.content.filter(block => block.type === 'text').map(block => block.text).join('\n') : raw.content ?? '';
  if (typeof content !== 'string') throw new Error('The provider returned invalid content.');
  const source = provider === 'anthropic' ? data.content.filter(block => block.type === 'tool_use') : raw.tool_calls ?? [];
  if (!Array.isArray(source)) throw new Error('The provider returned invalid tool calls.');
  const ids = new Set();
  const calls = source.map((call, i) => {
    const name = provider === 'anthropic' ? call?.name : call?.function?.name;
    const id = call?.id ?? `call_${i}`;
    if (typeof name !== 'string' || !name || typeof id !== 'string' || !id || ids.has(id)) throw new Error('The provider returned invalid tool calls.');
    ids.add(id);
    return { id, name, arguments: parseToolArguments(provider === 'anthropic' ? call.input : call.function.arguments) };
  });
  if (!content && !calls.length) throw new Error('The model returned an empty reply. Try again or choose a different model.');
  return { role: 'assistant', content, calls, raw: structuredClone(raw) };
}
// Conversion is only a boundary adapter for desktop's existing persisted wire history.
function fromWireMessages(messages) {
  return messages.filter(message => message.role !== 'system').map(message => {
    if (message.role === 'tool') return { role: 'tool', content: message.content, callId: message.tool_call_id, name: message.name || message.tool_name };
    if (message.role === 'assistant') return { role: 'assistant', content: message.content || '', raw: structuredClone(message) };
    return { role: message.role, content: message.content };
  });
}
function makeWireRequest(provider, connection, messages, tools = [], config = {}) {
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  return makeRequest(provider, connection, system, fromWireMessages(messages), tools.map(tool => tool.function || tool), config);
}
function providerError(status, data = {}) {
  const message = status === 402 || data.billing ? 'Insufficient API credits. Check billing in your provider account, then try again.'
    : status === 401 || status === 403 ? 'Check your API key and access.'
    : status === 429 ? 'Rate limit or credit limit reached; retry later.'
    : 'Check your model, API base URL, and tool support.';
  const error = new Error(`Provider HTTP ${status}. ${message}`);
  error.status = status;
  error.code = [400, 404, 422].includes(status) && data.toolsUnsupported ? 'TOOLS_UNSUPPORTED' : 'PROVIDER_HTTP';
  return error;
}
async function send(transport, request, signal, timeoutMs = 120000) {
  signal.throwIfAborted();
  const controller = new AbortController();
  let timer, abort;
  const guard = new Promise((_, reject) => {
    abort = () => { reject(new Error('Stopped.')); controller.abort(); };
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { reject(new Error(`The provider timed out after ${timeoutMs / 1000} seconds. Try a smaller model or prompt.`)); controller.abort(); }, timeoutMs);
  });
  try {
    const response = await Promise.race([Promise.resolve().then(() => { controller.signal.throwIfAborted(); return transport(request, controller.signal); }), guard]);
    signal.throwIfAborted();
    if (response.status >= 400) throw providerError(response.status, response.json);
    return response.json;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
function fetchTransport(fetchImpl) {
  return async (request, signal) => {
    let response;
    try { response = await fetchImpl(request.url, { method: request.method, headers: request.headers, body: request.body, signal }); }
    catch { signal?.throwIfAborted(); throw new Error('Cannot reach the provider. Check the connection and model server.'); }
    const text = await response.text();
    if (!response.ok) return { status: response.status, json: safeErrorData(text) };
    try { return { status: response.status, json: JSON.parse(text) }; } catch { throw new Error('The provider returned invalid JSON.'); }
  };
}
async function listModels(provider, connection, transport, signal) {
  validate(provider, connection, false);
  const headers = {};
  if (provider === 'anthropic') Object.assign(headers, { 'x-api-key': connection.apiKey, 'anthropic-version': '2023-06-01' });
  else if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
  const response = await send(transport, { url: endpoint(connection.baseUrl, provider === 'ollama' ? '/api/tags' : '/models'), method: 'GET', headers }, signal);
  return (provider === 'ollama' ? response.models ?? [] : response.data ?? []).map(model => model.id ?? model.name).filter(model => typeof model === 'string').sort();
}
async function completeWire({ provider, connection, messages, tools = [], options = {}, dataCollection = 'deny', signal = new AbortController().signal, timeoutMs, fetch: fetchImpl }) {
  const request = makeWireRequest(provider, connection, messages, tools, { options, dataCollection });
  const data = await send(fetchTransport(fetchImpl), request, signal, timeoutMs);
  return parseResponse(provider, data);
}
async function streamWire({ provider, connection, messages, options = {}, dataCollection = 'deny', signal, fetch: fetchImpl }) {
  if (!['openrouter', 'compatible'].includes(provider)) throw new Error('This streaming adapter requires an OpenAI-compatible provider.');
  signal?.throwIfAborted();
  const request = makeWireRequest(provider, connection, messages, [], { options, dataCollection, stream: true });
  let response;
  try { response = await fetchImpl(request.url, { method: request.method, headers: request.headers, body: request.body, signal }); }
  catch { signal?.throwIfAborted(); throw new Error('Cannot reach the provider. Check the connection and model server.'); }
  if (!response.ok) throw providerError(response.status, safeErrorData(await response.text()));
  return { ok: true, status: response.status, body: sseToNdjson(response.body, { onUsage: provider === 'openrouter' ? openRouterUsage : undefined }) };
}
module.exports = { endpoint, safeErrorData, looksLikeNoToolSupport, makeRequest, makeWireRequest, mapCompatibleOptions, parseToolArguments, parseResponse, wireMessages, fromWireMessages, send, fetchTransport, listModels, completeWire, streamWire };
