const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mechape-core-package-'));
const npm = (args, cwd) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, encoding:'utf8' });
try {
  const [packed] = JSON.parse(npm(['pack','--json','--pack-destination',temp],process.cwd()));
  assert.deepEqual(packed.files.map(file => file.path).sort(), ['LICENSE','README.md','package.json','src/openrouter.d.ts','src/openrouter.js','src/prompt.d.ts','src/prompt.js','src/skills.d.ts','src/skills.js','src/providers.js','src/providers.d.ts','src/agent.js','src/agent.d.ts','src/stream.js','src/stream.d.ts'].sort());
  fs.writeFileSync(path.join(temp,'package.json'),'{"private":true}');
  npm(['install','--ignore-scripts','--no-audit','--no-fund',path.join(temp,packed.filename)],temp);
  execFileSync(process.execPath,['-e', "for (const name of ['openrouter','prompt','skills','providers','agent','stream']) { if (!Object.keys(require('@mechape/core/'+name)).length) process.exit(1); }"],{cwd:temp});
  console.log('Packed file allowlist and installed package exports verified.');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
