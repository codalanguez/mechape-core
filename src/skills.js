// MechApe shared SKILL.md parser, extracted unchanged from desktop lib/skills.js. MIT.
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  let curKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (kv) { curKey = kv[1]; meta[curKey] = kv[2].trim(); }
    else if (curKey && /^\s+\S/.test(line)) meta[curKey] += ' ' + line.trim(); // folded multiline
  }
  return { meta, body: m[2] };
}
module.exports = { parseFrontmatter };
