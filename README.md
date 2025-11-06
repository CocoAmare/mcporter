# mcporter 🧳
_TypeScript runtime, CLI, and code-generation toolkit for the Model Context Protocol._

mcporter helps you lean into the "code execution" workflows highlighted in Anthropic's **Code Execution with MCP** guidance: discover the MCP servers already configured on your system, call them directly, compose richer automations in TypeScript, and mint single-purpose CLIs when you need to share a tool. All of that works out of the box -- no boilerplate, no schema spelunking.

## Key Capabilities

- **Zero-config discovery.** `createRuntime()` loads `config/mcporter.json`, merges Cursor/Claude/Codex imports, expands `${ENV}` placeholders, and pools connections so you can reuse transports across multiple calls.
- **One-command CLI generation.** `mcporter generate-cli` turns any MCP server definition into a ready-to-run CLI, with optional bundling/compilation and metadata for easy regeneration.
- **Friendly composable API.** `createServerProxy()` exposes tools as ergonomic camelCase methods, automatically applies JSON-schema defaults, validates required arguments, and hands back a `CallResult` with `.text()`, `.markdown()`, `.json()`, and `.content()` helpers.
- **OAuth and stdio ergonomics.** Built-in OAuth caching, log tailing, and stdio wrappers let you work with HTTP, SSE, and stdio transports from the same interface.

## Quick Start

mcporter auto-discovers the MCP servers you already configured in Cursor, Claude Code/Desktop, Codex, or local overrides. You can try it immediately with `npx`--no installation required.

### List your MCP servers

```bash
npx mcporter list
npx mcporter list context7 --schema
```

### Context7: fetch docs (no auth required)

```bash
npx mcporter call context7.resolve-library-id libraryName=react
npx mcporter call context7.get-library-docs context7CompatibleLibraryID=/websites/react_dev topic=hooks
```

### Linear: search documentation (requires `LINEAR_API_KEY`)

```bash
LINEAR_API_KEY=sk_linear_example npx mcporter call linear.search_documentation query="automations"
```

### Chrome DevTools: snapshot the current tab

```bash
npx mcporter call chrome-devtools.take_snapshot
```

Helpful flags:

- `--config <path>` -- custom config file (defaults to `./config/mcporter.json`).
- `--root <path>` -- working directory for stdio commands.
- `--log-level <debug|info|warn|error>` -- adjust verbosity (respects `MCPORTER_LOG_LEVEL`).
- `--tail-log` -- stream the last 20 lines of any log files referenced by the tool response.
- For OAuth-protected servers such as `vercel`, run `npx mcporter auth vercel` once to complete login.

Timeouts default to 30 s; override with `MCPORTER_LIST_TIMEOUT` or `MCPORTER_CALL_TIMEOUT` when you expect slow startups.


## Installation

### Run instantly with `npx`

```bash
npx mcporter list
```

### Add to your project

```bash
pnpm add mcporter
```

### Homebrew (planned for mcporter 0.3.0)

```bash
brew tap steipete/tap
brew install steipete/tap/mcporter
```

> The tap publishes alongside mcporter 0.3.0. Until then, use `npx` or `pnpm add`.

## One-shot calls from code

```ts
import { callOnce } from "mcporter";

const result = await callOnce({
	server: "firecrawl",
	toolName: "crawl",
	args: { url: "https://anthropic.com" },
});

console.log(result); // raw MCP envelope
```

`callOnce` automatically discovers the selected server (including Cursor/Claude/Codex imports), handles OAuth prompts, and closes transports when it finishes. It is ideal for manual runs or wiring mcporter directly into an agent tool hook.

## Compose Automations with the Runtime

```ts
import { createRuntime } from "mcporter";

const runtime = await createRuntime();

const tools = await runtime.listTools("context7");
const result = await runtime.callTool("context7", "resolve-library-id", {
	args: { libraryName: "react" },
});

console.log(result); // raw MCP envelope
await runtime.close(); // shuts down transports and OAuth sessions
```

Reach for `createRuntime()` when you need connection pooling, repeated calls, or advanced options such as explicit timeouts and log streaming. The runtime reuses transports, refreshes OAuth tokens, and only tears everything down when you call `runtime.close()`.

## Compose Tools in Code

The runtime API is built for agents and scripts, not just humans at a terminal.

```ts
import { createRuntime, createServerProxy } from "mcporter";

const runtime = await createRuntime();
const chrome = createServerProxy(runtime, "chrome-devtools");
const linear = createServerProxy(runtime, "linear");

const snapshot = await chrome.takeSnapshot();
console.log(snapshot.text());

const docs = await linear.searchDocumentation({
	query: "automations",
	page: 0,
});
console.log(docs.json());
```

Friendly ergonomics baked into the proxy and result helpers:

- Property names map from camelCase to kebab-case tool names (`takeSnapshot` -> `take_snapshot`).
- Positional arguments map onto schema-required fields automatically, and option objects respect JSON-schema defaults.
- Results are wrapped in a `CallResult`, so you can choose `.text()`, `.markdown()`, `.json()`, `.content()`, or access `.raw` when you need the full envelope.

Drop down to `runtime.callTool()` whenever you need explicit control over arguments, metadata, or streaming options.

## Generate a Standalone CLI

Turn any server definition into a shareable CLI artifact:

```bash
npx mcporter generate-cli \
  --command https://mcp.context7.com/mcp

# Outputs:
#   context7.ts        (TypeScript template with embedded schemas)
#   context7.js        (bundled CLI via esbuild)
#   context7.js.metadata.json
```

- `--name` overrides the inferred CLI name.
- Add `--description "..."` if you want a custom summary in the generated help output.
- Add `--bundle [path]` to emit an esbuild bundle alongside the template.
- `--output <path>` writes the template somewhere specific.
- `--runtime bun|node` picks the runtime for generated code (Bun required for `--compile`).
- Add `--compile` to emit a Bun-compiled binary; mcporter cleans up intermediate bundles when you omit `--bundle`.

Every artifact is paired with metadata capturing the generator version, resolved server definition, and invocation flags. Use:

```
npx mcporter inspect-cli dist/context7.js     # human-readable summary
npx mcporter regenerate-cli dist/context7.js  # replay with latest mcporter
```

## Configuration Reference

`config/mcporter.json` mirrors Cursor/Claude's shape:

```jsonc
{
	"mcpServers": {
		"context7": {
			"description": "Context7 docs MCP",
			"baseUrl": "https://mcp.context7.com/mcp",
			"headers": {
				"Authorization": "$env:CONTEXT7_API_KEY"
			}
		},
		"chrome-devtools": {
			"command": "bash",
			"args": ["scripts/mcp_stdio_wrapper.sh", "env", "npx", "-y", "chrome-devtools-mcp@latest"]
		}
	},
	"imports": ["cursor", "claude-code", "claude-desktop", "codex"]
}
```

What mcporter handles for you:

- `${VAR}`, `${VAR:-fallback}`, and `$env:VAR` interpolation for headers and env entries.
- Automatic OAuth token caching under `~/.mcporter/<server>/` unless you override `tokenCacheDir`.
- Stdio commands inherit the directory of the file that defined them (imports or local config).
- Import precedence matches the array order; omit `imports` to use the default `["cursor", "claude-code", "claude-desktop", "codex"]`.

Provide `configPath` or `rootDir` to CLI/runtime calls when you juggle multiple config files side by side.

## Testing and CI

| Command | Purpose |
| --- | --- |
| `pnpm check` | Biome formatting plus Oxlint/tsgolint gate. |
| `pnpm build` | TypeScript compilation (emits `dist/`). |
| `pnpm test` | Vitest unit and integration suites (streamable HTTP fixtures included). |

CI runs the same trio via GitHub Actions.

## License

MIT -- see [LICENSE](LICENSE).
