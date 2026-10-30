# @mechape/core

The portable, MIT-licensed core used by MechApe desktop and its free Obsidian plugin. This package has no runtime dependencies, network calls, filesystem access, secrets, telemetry, UI, or licensing enforcement.

## Install

```sh
npm install --save-exact https://github.com/codalanguez/mechape-core/releases/download/v0.1.0/mechape-core-0.1.0.tgz
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

The initial release extracts the existing shared implementation without changing its behavior. Direct Anthropic/Ollama adapters and agent loops are not yet unified. Obsidian vault boundaries and write review, desktop filesystem tools, credential storage, and paid licensing stay in their host applications.

## Develop and release

Use Node 22 or newer. Run `npm ci`, `npm test`, and `npm run check:package`. The package check creates a tarball, installs it into an isolated temporary project, and exercises all exported entry points. CI runs on Windows, macOS, and Linux.

For an update: change this repository, add contract tests, bump the package version, and create a matching `vX.Y.Z` tag. Run `npm pack` and attach its tarball plus SHA256SUMS.txt to that tag's GitHub release. Never replace a published package in place. Update both consumers to the new exact tarball URL, commit their lockfiles, and run their integration tests and production builds. Changes to package exports or behavior require a deliberate version bump and review in both hosts.
