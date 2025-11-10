---
summary: 'Where mcporter looks for external MCP configs and the formats each import kind understands.'
read_when:
  - 'Investigating missing imported servers'
  - 'Adding or modifying config import kinds'
---

# Import Reference

mcporter merges your local `config/mcporter.json` with editor- or tool-specific config files so you can reuse servers without copying them manually. This document spells out the supported formats, the directories we scan for each import kind, and how precedence works.

## Import Pipeline

1. `config/mcporter.json` is loaded first (or the file passed to `--config`). If it includes an `"imports"` array, that array defines the exact order we follow. If the array is omitted, we use the default order `["cursor", "claude-code", "claude-desktop", "codex", "windsurf", "opencode", "vscode"]`.
2. For each import kind, we probe the project-relative path (e.g., `.cursor/mcp.json`) and then the per-user path. The first readable file is parsed and converted into mcporter’s normalized schema. Names collide on a “first wins” basis—once an imported name is merged, later imports with the same name are ignored unless the local config defines an override.
3. Finally, any servers declared inside `mcpServers` take precedence over imports regardless of the order above.

Set `"imports": []` when you want to disable auto-merging entirely, or supply a subset (for example `["cursor", "codex"]`) to reduce the latency of `mcporter list`.

## Supported Formats

- **JSON containers**: Cursor, Claude Code, Windsurf, and VS Code configs use JSON. We accept three shapes:
  - Root-level dictionary where each key is a server (`{ "my-server": { ... } }`).
  - `{ "mcpServers": { ... } }` (Cursor-style).
  - `{ "servers": { ... } }` (older VS Code previews).
- **TOML container**: Codex uses TOML files with `[mcp_servers.<name>]` tables. Only `.codex/config.toml` is recognized.
- **Shared fields**: We convert JSON/TOML entries into mcporter’s schema, honoring `baseUrl`, `command` (string or array), `args`, `headers`, `env`, `bearerToken`, `bearerTokenEnv`, `description`, `tokenCacheDir`, `clientName`, and `auth`. Extra properties are ignored.

## Lookup Paths by Import Kind

| Kind | Format | Project paths | User paths | Notes |
| --- | --- | --- | --- | --- |
| `cursor` | JSON (`mcpServers`) | `.cursor/mcp.json` | macOS/Linux: `${XDG_CONFIG_HOME:-~/.config}/Cursor/User/mcp.json`<br>Windows: `%APPDATA%/Cursor/User/mcp.json` | Cursor writes one file per workspace; the user file mirrors Cursor’s “global” MCP settings. |
| `claude-code` | JSON (`mcpServers`) | `.claude/settings.local.json`, `.claude/settings.json`, `.claude/mcp.json` | `~/.claude/settings.json`, `~/.claude/mcp.json`, `~/.claude.json` | `settings.local.json` (untracked overrides) takes precedence over `settings.json`, which in turn beats legacy `mcp.json`.citeturn0search0 |
| `claude-desktop` | JSON (`mcpServers`) | — | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%/Claude/claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` | Desktop Claude stores all servers per-machine; there is no project-relative file. |
| `codex` | TOML (`[mcp_servers.*]`) | `.codex/config.toml` | `~/.codex/config.toml` | Codex only uses `config.toml`; the deprecated `mcp.toml` filename is no longer searched. |
| `windsurf` | JSON (`mcpServers`) | — | Windows: `%APPDATA%/Codeium/windsurf/mcp_config.json`<br>macOS/Linux: `~/.codeium/windsurf/mcp_config.json` | Windsurf stores global MCP servers under Codeium’s directory. |
| `opencode` | JSON/JSONC (`mcp` or `mcpServers`) | `<root>/opencode.json`<br>`<root>/opencode.jsonc` | `OPENCODE_CONFIG` (highest priority)<br>`OPENCODE_CONFIG_DIR/opencode.json(c)`<br>macOS/Linux: `${XDG_CONFIG_HOME:-~/.config}/opencode/opencode.json(c)`<br>Windows: `%APPDATA%/opencode/opencode.json(c)` | Supports the OpenCode config layout, including comment-friendly `.jsonc` files and the `mcp` root object. |
| `vscode` | JSON (`mcpServers` or `servers`) | — | macOS: `~/Library/Application Support/Code(/Code - Insiders)/User/mcp.json`<br>Windows: `%APPDATA%/Code(/Code - Insiders)/User/mcp.json`<br>Linux: `~/.config/Code(/Code - Insiders)/User/mcp.json` | We check both stable and Insiders directories. |

> Tip: mcporter resolves `~` and `$XDG_CONFIG_HOME` inside these paths automatically, so you can rely on the same `imports` list across platforms.

## Verifying Imports

- Run `mcporter list --json | rg '"source":'` to confirm the resolved file for each imported server.
- Use `mcporter list --source import` to limit the output to merged definitions when you’re debugging precedence.
- When tests need deterministic data, follow `tests/config-imports.test.ts`—it copies fixtures into a fake home directory and asserts the merged server order.

Keeping this reference up to date is the best way to prevent “my editor has servers but mcporter can’t see them” bug reports. If you add a new import kind, update this table, add fixtures under `tests/fixtures/imports`, and document the format here.
