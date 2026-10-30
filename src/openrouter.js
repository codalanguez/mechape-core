// MechApe shared core. Canonical source: codalanguez/mechape-core; MIT. No host APIs or secrets.
const DESC_MAX = 220;
const asNum = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const CACHEABLE = /^(anthropic|google)\//;
const remoteId = name => name.startsWith('openrouter:') ? name.slice('openrouter:'.length) : name;

function mapModel(m) {
  const arch = m.architecture || {};
  const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
  const inputs = Array.isArray(arch.input_modalities) ? arch.input_modalities : [];
  const bench = (m.benchmarks && m.benchmarks.artificial_analysis) || {};
  const desc = typeof m.description === 'string' ? m.description.trim() : '';
  return {
    id: m.id,
    name: m.name || m.id,
    contextLength: m.context_length || null,
    // USD per token (strings from the API); the UI turns these into $/M tokens
    promptPrice: m.pricing ? Number(m.pricing.prompt) : null,
    completionPrice: m.pricing ? Number(m.pricing.completion) : null,
    // capabilities, as reported — not inferred from the name
    vision: inputs.includes('image'),
    tools: params.includes('tools'),
    reasoning: params.includes('reasoning'),
    // null, never 0, when a model carries no benchmarks at all
    coding: asNum(bench.coding_index),
    intelligence: asNum(bench.intelligence_index),
    agentic: asNum(bench.agentic_index),
    description: desc.length > DESC_MAX ? `${desc.slice(0, DESC_MAX - 1).trimEnd()}…` : desc,
  };
}

function mapOptions(o = {}) {
  const out = {};
  if (o.temperature != null) out.temperature = o.temperature;
  if (o.top_p != null) out.top_p = o.top_p;
  if (o.top_k != null) out.top_k = o.top_k;
  if (o.min_p != null) out.min_p = o.min_p;
  if (o.seed != null) out.seed = o.seed;
  if (o.stop) out.stop = o.stop;
  if (o.num_predict != null && o.num_predict > 0) out.max_tokens = o.num_predict;
  if (o.repeat_penalty != null) out.repetition_penalty = o.repeat_penalty;
  return out;
}

function buildChatPayload({ model, messages, options, dataCollection = 'deny' }) {
  const o = options || {};
  let id = remoteId(model);
  if (o.or_route && !id.includes(':')) id = `${id}:${o.or_route}`;

  let msgs = messages;
  if (CACHEABLE.test(id) && msgs.length && msgs[0].role === 'system') {
    msgs = [
      { role: 'system', content: [{ type: 'text', text: msgs[0].content, cache_control: { type: 'ephemeral' } }] },
      ...msgs.slice(1),
    ];
  }

  const payload = { model: id, messages: msgs, stream: true, usage: { include: true }, ...mapOptions(o) };
  if (dataCollection === 'deny') payload.provider = { data_collection: 'deny' };
  return payload;
}

function headers(apiKey) {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey,
    'HTTP-Referer': 'https://codalanguez.com/mechape/', 'X-Title': 'MechApe' };
}
module.exports = { mapModel, mapOptions, buildChatPayload, headers };
