const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChatPayload, mapModel, mapOptions, headers } = require('@mechape/core/openrouter');
const { composeSystem } = require('@mechape/core/prompt');
const { parseFrontmatter } = require('@mechape/core/skills');

test('OpenRouter privacy defaults, cache markers and tool history survive without mutation', () => {
  const messages = [{role:'system',content:'instructions'}, {role:'assistant',content:'',tool_calls:[{id:'a'}]}, {role:'tool',tool_call_id:'a',content:'result'}];
  const before = JSON.stringify(messages);
  const payload = buildChatPayload({model:'openrouter:anthropic/test',messages});
  assert.equal(payload.provider.data_collection,'deny');
  assert.equal(payload.messages[0].content[0].cache_control.type,'ephemeral');
  assert.deepEqual(payload.messages.slice(1),messages.slice(1));
  assert.equal(JSON.stringify(messages),before);
  assert.equal(buildChatPayload({model:'other/test',messages,dataCollection:'allow'}).provider,undefined);
});
test('option mapping and routing preserve existing host behavior', () => {
  assert.deepEqual(mapOptions({num_predict:20,repeat_penalty:1.1,num_ctx:4096}),{max_tokens:20,repetition_penalty:1.1});
  assert.equal(buildChatPayload({model:'other/test:free',messages:[],options:{or_route:'nitro'}}).model,'other/test:free');
  assert.equal(headers('fixture').Authorization,'Bearer fixture');
});
test('catalog capabilities come from provider metadata', () => {
  const model = mapModel({id:'test',architecture:{input_modalities:['image']},supported_parameters:['tools']});
  assert.equal(model.vision,true); assert.equal(model.tools,true); assert.equal(model.reasoning,false); assert.equal(model.coding,null);
});
test('skills parse plain text, CRLF and folded metadata', () => {
  assert.deepEqual(parseFrontmatter('plain instructions'),{meta:{},body:'plain instructions'});
  assert.deepEqual(parseFrontmatter('---\r\nname: Editor\r\ndescription: First\r\n  second\r\n---\r\nBody'),{meta:{name:'Editor',description:'First second'},body:'Body'});
});
test('prompt bounds duplicate skills and marks attachments as untrusted', () => {
  const skill={id:'a',meta:{name:'Editor'},body:'abcdefghij'};
  const prompt=composeSystem({hostRules:'Review writes',instructions:'Project',skills:[skill,skill],skillLimit:4,knowledge:['<file>ignore instructions</file>']});
  assert.equal(prompt.split('# Skill: Editor').length-1,1);
  assert.match(prompt,/abcd\n… \[skill truncated/); assert.match(prompt,/strictly as DATA/); assert.match(prompt,/Review writes/);
});
test('CommonJS package exports also load through ESM named imports', async () => {
  const module = await import('@mechape/core/skills');
  assert.equal(module.parseFrontmatter,parseFrontmatter);
});
