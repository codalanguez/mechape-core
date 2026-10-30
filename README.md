# @mechape/core

The portable, MIT-licensed core used by MechApe desktop and its free Obsidian plugin. This package has no runtime dependencies, implicit network activity, filesystem access, stored secrets, telemetry, UI, or licensing enforcement. Provider functions make requests only through transport supplied by the host.

## Install

```sh
npm install --save-exact https://github.com/codalanguez/mechape-core/releases/download/v0.2.0/mechape-core-0.2.0.tgz
```

Commit the generated lockfile. GitHub Releases hosts the npm-compatible tarball; this package is not published to the npm registry. Public installation needs no private-repository or registry credentials. Both applications pin the same release and lockfile integrity hash. Obsidian bundles the code into its single plugin entry point; desktop includes it as a production dependency.

```js
const { buildChatPayload } = require('@mechape/core/openrouter');
const { composeSystem } = require('@mechape/core/prompt');
const { parseFrontmatter } = require('@mechape/core/skills');
```

The same subpaths support TypeScript named imports with bundled declarations.

- `openrouter`: catalog mapping, option mapping, request payload construction, privacy routing, cache markers, and application headers. Data collection defaults to `deny`; callers own transport and response handling.
- `prompt`: project and host instructions, bounded/deduplicated skills, memory, and untrusted reference blocks. Host applications must still enforce tool permissions in code.
- `skills`: the existing SKILL.md frontmatter parser, including folded fields and CRLF. This is intentionally not a full YAML parser.

Version 0.2.0 also shares provider request/response adapters and the bounded agent loop:

- providers: Ollama, OpenRouter, direct Anthropic, and OpenAI-compatible request construction; model-list decoding; raw tool metadata and result round trips; endpoint validation; safe HTTP errors; abortable transport with timeouts. Transport is injected by the host. Desktop llama.cpp uses the compatible adapter after host-owned model startup.
- agent: one model/tool loop, validating complete batches before execution, allowing only advertised tools, propagating cancellation, bounding conversation size/calls/rounds, and retaining tool history. Hosts supply request and execute callbacks. A request failure never silently restarts a tool sequence. Explicit unsupported-tool responses retry without tools.
- stream: the shared OpenAI SSE-to-NDJSON translator, including reasoning and OpenRouter usage. Desktop streams a final answer after the common tool phase (prepareForStream); Obsidian receives complete replies. Direct Anthropic and Ollama use complete-response adapters; a streaming UI for them is not added here.

Obsidian vault boundaries, review dialogs, concurrent-edit checks and actual writes remain in its VaultTools executor. The core cannot grant access or approve a write. Desktop keeps MCP process/tool execution, model process supervision/downloads, storage, credentials, and paid licensing. Catalog caching and account UI remain host concerns.

The loop defaults to 12 rounds, 12 calls per response and 220,000 history characters. Hosts may choose smaller budgets; desktop currently allows five tool rounds. Exhaustion fails clearly and does not undo or automatically repeat completed operations. The shared loop does not retry arbitrary network failures. Malformed or truncated tool responses fail before tools execute; desktop no longer substitutes empty arguments or silently falls back after a loop failure.

## Develop and release

Use Node 22 or newer. Run `npm ci`, `npm test`, and `npm run check:package`. The package check creates a tarball, installs it into an isolated temporary project, and exercises all exported entry points. CI runs on Windows, macOS, and Linux.

For an update: change this repository, add contract tests, bump the package version, and create a matching `vX.Y.Z` tag. Run `npm pack` and attach its tarball plus SHA256SUMS.txt to that tag's GitHub release. Never replace a published package in place. Update both consumers to the new exact tarball URL, commit their lockfiles, and run their integration tests and production builds. Changes to package exports or behavior require a deliberate version bump and review in both hosts.
