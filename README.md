# mcp-runtime 🔌

A modern TypeScript runtime and CLI for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). `mcp-runtime` replaces the Python-based `pnpm mcp:*` helpers with an ergonomic, composable package that works equally well for command-line operators and long-running agents.

## Features

- **Zero-config CLI** – `npx mcp-runtime list` and `npx mcp-runtime call` mirror the existing Sweetistics workflows while adding niceties such as `--tail-log`.
- **Composable runtime API** – `createRuntime()` pools connections, handles retries, and exposes a typed interface for Bun/Node agents.
- **OAuth support** – automatic browser launches, local callback server, and token persistence under `~/.mcp-runtime/<server>/` (compatible with existing `token_cache_dir` overrides).
- **Structured configuration** – reuses `config/mcp_servers.json` entries, expanding `${ENV}` placeholders, stdio wrappers, and headers exactly as the Python helper did.
- **Integration-ready** – ships with unit and integration tests (including a streamable HTTP fixture) plus GitHub Actions CI, so changes remain trustworthy.

## Installation

```bash
pnpm add mcp-runtime
# or
yarn add mcp-runtime
# or
npm install mcp-runtime
```

## Quick Start

```ts
import { createRuntime } from "mcp-runtime";

const runtime = await createRuntime({ configPath: "./config/mcp_servers.json" });

const tools = await runtime.listTools("chrome-devtools");
const screenshot = await runtime.callTool("chrome-devtools", "take_screenshot", {
  args: { url: "https://x.com" },
});

await runtime.close();
```

Prefer `createRuntime` when you plan to issue multiple calls—the runtime caches connections, handles OAuth refreshes, and closes transports when you call `runtime.close()`.

An end-to-end example lives in `examples/context7-headlines.ts`; it resolves a library via Context7, fetches documentation, and prints the markdown headings. Run it with:

```
pnpm exec tsx examples/context7-headlines.ts
```

Need a quick, single invocation?

```ts
import { callOnce } from "mcp-runtime";

const result = await callOnce({
  server: "firecrawl",
  toolName: "crawl",
  args: { url: "https://anthropic.com" },
  configPath: "./config/mcp_servers.json",
});
```

## CLI Reference

```
npx mcp-runtime list                          # list all configured servers
npx mcp-runtime list vercel --schema          # show tool signatures + schemas
npx mcp-runtime call linear.searchIssues owner=ENG status=InProgress
npx mcp-runtime call signoz.query --tail-log  # print the tail of returned log files

# local scripts mirroring the Sweetistics workflow
pnpm mcp:list                                 # alias for mcp-runtime list
pnpm mcp:call chrome-devtools.getTabs --tail-log
```

`pnpm mcp:list` respects `MCP_LIST_TIMEOUT` (milliseconds, default `60000`). Export a higher value when you need to inspect slow-starting servers:

```
MCP_LIST_TIMEOUT=120000 pnpm mcp:list vercel
```

Common flags:

| Flag | Description |
| --- | --- |
| `--config <path>` | Path to `mcp_servers.json` (defaults to `./config/mcp_servers.json`). |
| `--root <path>` | Working directory for stdio commands (so `scripts/*` resolve correctly). |
| `--tail-log` | After the tool completes, print the last 20 lines of any referenced log file. |

### OAuth Flow

When a server entry declares `"auth": "oauth"`, the CLI/runtime will:

1. Launch a temporary callback server on `127.0.0.1`.
2. Open the authorization URL in your default browser (or print it if launching fails).
3. Exchange the resulting code and persist refreshed tokens under `~/.mcp-runtime/<server>/`.

To reset credentials, delete that directory and rerun the command—`mcp-runtime` will trigger a fresh login.

## Composable Workflows

The package exports a thin runtime that lets you compose multiple MCP calls and post-process the results entirely in TypeScript. The example in `examples/context7-headlines.ts` demonstrates how to:

1. Resolve a library ID with `context7.resolve-library-id`
2. Fetch the docs via `context7.get-library-docs`
3. Derive a summary (markdown headings) locally

Use the pattern to build richer automations—batch fetch docs, search with Context7, or pass results into another MCP server without shelling out to the CLI.

## Testing & CI

| Command | Purpose |
| --- | --- |
| `pnpm check` | Biome lint/format check. |
| `pnpm build` | TypeScript compilation (emits `dist/`). |
| `pnpm test` | Vitest unit + integration suites (includes a streamable HTTP MCP fixture). |

GitHub Actions (`.github/workflows/ci.yml`) runs the same trio on every push and pull request.

## Roadmap

- Smoother OAuth UX (`mcp-runtime auth <server>`, timeout warnings).
- Tailing for streaming `structuredContent`, not just file paths.
- Optional code generation for high-frequency tool schemas.
- Automated release tooling (changelog, tagged publishes).

For deeper architectural notes, see [`docs/spec.md`](docs/spec.md).

## License

MIT — see [LICENSE](LICENSE).
