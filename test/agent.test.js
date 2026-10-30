const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('@mechape/core/agent');
const { makeRequest, parseResponse, send, safeErrorData, fetchTransport, wireMessages, mapCompatibleOptions } = require('@mechape/core/providers');
const definition = { name: 'read_note', description: 'Read', parameters: { type: 'object' } };
const call = { id: 'one', name: 'read_note', arguments: { path: 'A.md' } };
const final = { role: 'assistant', content: 'done' };
const toolReply = { role: 'assistant', content: '', calls: [call] };
const base = () => ({ messages: [{ role: 'user', content: 'Read A' }], definitions: [definition], signal: new AbortController().signal });

test('compatible local sampling preserves llama.cpp names independently of OpenRouter', () => {
  const options = mapCompatibleOptions({ repeat_penalty: 1.1, repeat_last_n: 64, mirostat: 2, num_ctx: 2048, num_predict: 50 });
  assert.deepEqual(options, { max_tokens: 50, repeat_penalty: 1.1, repeat_last_n: 64, mirostat: 2 });
});

for (const provider of ['ollama', 'openrouter', 'anthropic', 'compatible']) {
  test(`${provider}: shared request, parse, tool result and terminal reply`, async () => {
    let requests = 0, executions = 0;
    const connection = { baseUrl: provider === 'ollama' ? 'http://localhost:11434' : 'https://example.org/v1', model: 'anthropic/test', apiKey: 'fixture' };
    const result = await runAgent({ ...base(), execute: async () => { executions++; return 'contents'; }, request: async (history, definitions) => {
      const body = JSON.parse(makeRequest(provider, connection, 'host rules', history, definitions).body);
      if (++requests > 1) { assert.match(JSON.stringify(body), /contents/); return final; }
      const raw = provider === 'anthropic' ? { content: [{ type: 'tool_use', id: 'one', name: call.name, input: call.arguments }] }
        : provider === 'ollama' ? { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: call.name, arguments: call.arguments } }] } }
        : { choices: [{ message: { role: 'assistant', content: '', reasoning_details: [{ data: 'opaque' }], tool_calls: [{ id: 'one', type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } }] };
      return parseResponse(provider, raw);
    } });
    assert.equal(executions, 1); assert.equal(requests, 2); assert.equal(result.at(-1).content, 'done');
  });
}
test('unadvertised calls never reach the host executor', async () => {
  let count = 0;
  await runAgent({ ...base(), definitions: [], execute: async () => { assert.fail('disabled execution'); }, request: async history => {
    if (++count === 1) return toolReply;
    assert.match(history.at(-1).content, /disabled or unavailable/); return final;
  } });
});
test('malformed or oversized batches are rejected before any tool executes', async () => {
  for (const calls of [[call, { ...call, id: 'two', arguments: '{broken' }], Array.from({ length: 13 }, (_, i) => ({ ...call, id: String(i) }))]) {
    let executed = false;
    await assert.rejects(runAgent({ ...base(), execute: async () => { executed = true; return ''; }, request: async () => ({ ...toolReply, calls }) }));
    assert.equal(executed, false);
  }
});
test('cancellation during the request prevents tool execution', async () => {
  const controller = new AbortController();
  await assert.rejects(runAgent({ ...base(), signal: controller.signal, execute: async () => assert.fail('cancelled execution'), request: async () => { controller.abort(); return toolReply; } }));
});
test('cancellation during a host operation prevents the next call', async () => {
  const controller = new AbortController(); let count = 0;
  await assert.rejects(runAgent({ ...base(), signal: controller.signal, execute: async () => { count++; controller.abort(); return 'done'; }, request: async () => ({ ...toolReply, calls: [call, { ...call, id: 'two' }] }) }));
  assert.equal(count, 1);
});
test('stream preparation retains completed tool results but excludes terminal prose', async () => {
  let count = 0;
  const history = await runAgent({ ...base(), prepareForStream: true, execute: async () => 'result', request: async () => ++count === 1 ? toolReply : final });
  assert.equal(history.at(-1).role, 'tool'); assert.equal(history.at(-1).content, 'result');
});
test('budget exhaustion and provider failure do not silently retry completed operations', async () => {
  let executions = 0, requests = 0;
  await assert.rejects(runAgent({ ...base(), execute: async () => { executions++; return 'applied'; }, request: async () => { if (++requests === 1) return toolReply; throw new Error('provider failed'); } }), /provider failed/);
  assert.equal(executions, 1); assert.equal(requests, 2);
  await assert.rejects(runAgent({ ...base(), maxRounds: 1, execute: async () => 'applied', request: async () => toolReply }), /Applied changes remain saved/);
});
test('explicit unsupported-tool response retries without tools but retains privacy', async () => {
  let count = 0;
  await runAgent({ ...base(), execute: async () => assert.fail(), request: async (_history, definitions) => {
    if (++count === 1) { assert.equal(definitions.length, 1); throw Object.assign(new Error('unsupported'), { code: 'TOOLS_UNSUPPORTED' }); }
    assert.equal(definitions.length, 0); return final;
  } });
  assert.equal(count, 2);
});
test('Anthropic adjacent blocks never mutate retained raw metadata', () => {
  const messages = [{role:'assistant',content:'a',raw:{content:[{type:'text',text:'a'}]}},{role:'assistant',content:'b',raw:{content:[{type:'text',text:'b'}]}}];
  const original = JSON.stringify(messages);
  assert.equal(wireMessages('anthropic', messages)[0].content.length, 2);
  assert.equal(JSON.stringify(messages), original);
});
test('transport cancellation is forwarded and timeouts abort the underlying request', async () => {
  let forwarded;
  const transport = (_request, signal) => { forwarded = signal; return new Promise(() => {}); };
  await assert.rejects(send(transport, {}, new AbortController().signal, 10), /timed out/);
  assert.equal(forwarded.aborted, true);
});
test('HTTP and network errors do not expose response bodies or credentials', async () => {
  const transport = fetchTransport(async () => new Response(JSON.stringify({ error: { message: 'insufficient credits SECRET' } }), { status: 402 }));
  await assert.rejects(send(transport, { url: 'https://example.org', method: 'POST', headers: {} }, new AbortController().signal), error => { assert.match(error.message, /Insufficient API credits/); assert.doesNotMatch(error.message, /SECRET/); return true; });
  assert.equal(safeErrorData('{"error":{"message":"No endpoints found that support tool use"}}').toolsUnsupported, true);
  assert.equal(safeErrorData('{"error":{"message":"invalid tool arguments"}}').toolsUnsupported, undefined);
});
