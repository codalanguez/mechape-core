const { parseToolArguments } = require('./providers');

// Hosts supply only model requests and tool execution. Permissions are never inferred from prompts.
async function runAgent({ messages: input, definitions = [], request, execute, signal,
  onText = async () => {}, onEvent = () => {}, maxRounds = 12, maxCalls = 12,
  maxHistoryChars = 220000, prepareForStream = false }) {
  for (const limit of [maxRounds, maxCalls, maxHistoryChars]) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid agent limit.');
  }
  const messages = structuredClone(input);
  let active = structuredClone(definitions);
  for (let round = 0; round < maxRounds; round++) {
    signal.throwIfAborted();
    if (JSON.stringify(messages).length > maxHistoryChars) throw new Error('This conversation is too large. Export it and start a new chat.');
    onEvent({ type: 'request', round });
    let result;
    try { result = await request(structuredClone(messages), structuredClone(active), signal); }
    catch (error) {
      signal.throwIfAborted();
      if (error.code === 'TOOLS_UNSUPPORTED' && active.length) {
        active = [];
        onEvent({ type: 'tool_unsupported' });
        continue;
      }
      throw error;
    }
    signal.throwIfAborted();
    if (!result || result.role !== 'assistant' || typeof result.content !== 'string') throw new Error('The provider returned no assistant message.');
    const calls = result.calls ?? [];
    if (!Array.isArray(calls)) throw new Error('The provider returned invalid tool calls.');
    if (calls.length > maxCalls) throw new Error('The model requested too many actions at once. Ask for a smaller task.');
    // Validate the entire batch before any host operation can run.
    const ids = new Set();
    for (const call of calls) {
      if (!call || typeof call.name !== 'string' || !call.name || typeof call.id !== 'string' || !call.id || ids.has(call.id)) throw new Error('The provider returned invalid tool calls.');
      ids.add(call.id);
      call.arguments = parseToolArguments(call.arguments);
    }
    if (!calls.length && prepareForStream) return messages;
    messages.push(result);
    if (result.content && !prepareForStream) await onText(result.content);
    signal.throwIfAborted();
    if (!calls.length) return messages;
    for (const call of calls) {
      signal.throwIfAborted();
      onEvent({ type: 'tool_start', call });
      const allowed = active.some(definition => definition.name === call.name);
      const content = allowed ? await execute(call, signal)
        : JSON.stringify({ status: 'error', message: 'This tool is disabled or unavailable.' });
      signal.throwIfAborted();
      if (typeof content !== 'string') throw new Error('Tool results must be text.');
      messages.push({ role: 'tool', callId: call.id, name: call.name, content });
      onEvent({ type: 'tool_done', call, allowed, content });
    }
  }
  onEvent({ type: 'tool_budget' });
  throw new Error(`Reached the ${maxRounds}-step limit. Applied changes remain saved; continue with a smaller request.`);
}

module.exports = { runAgent };
