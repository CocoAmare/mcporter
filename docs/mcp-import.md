---
summary: 'Which third-party editors/agents mcporter can import MCP servers from, plus quick setup steps.'
read_when:
  - 'Explaining supported external configs to teammates'
  - 'Debugging why a specific editor-managed server is missing'
---

# MCP Import Support Matrix

mcporter automatically merges a handful of well-known editor and agent config files into `config/mcporter.json` so you can reuse servers without copy/pasting JSON. The table below summarizes every external source we currently support, the file formats we parse, and the precedence/path rules. For the low-level parsing details (schemas, precedence algorithm, fixtures), see [docs/import.md](import.md).

| Import kind | Typical owner | File format | Project paths we check | User/Global paths we check | Notes |
| --- | --- | --- | --- | --- | --- |
| `cursor` | Cursor IDE | JSON (`mcpServers`) | `.cursor/mcp.json` | macOS/Linux: `${XDG_CONFIG_HOME:-~/.config}/Cursor/User/mcp.json`<br>Windows: `%APPDATA%/Cursor/User/mcp.json` | Mirrors Cursor’s “MCP Servers” panel. Per-workspace files override the global file when both exist. |
| `claude-code` | Claude Code (browser) | JSON (`mcpServers`) | `.claude/settings.local.json`, `.claude/settings.json`, `.claude/mcp.json` | `~/.claude/settings.json`, `~/.claude/mcp.json`, `~/.claude.json` | `settings.local.json` (ignored by git) overrides `settings.json`, which is the shared project config; both beat the legacy `mcp.json`.citeturn0search0 |
| `claude-desktop` | Claude Desktop | JSON (`mcpServers`) | — | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%/Claude/claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` | Desktop Claude stores everything per-machine, so there’s no project-relative config. |
| `codex` | Sweetistics Codex | TOML (`[mcp_servers.*]`) | `.codex/config.toml` | `~/.codex/config.toml` | We ignore the deprecated `mcp.toml` filename. Nested tables inherit stdio CWD based on their file location. |
| `windsurf` | Codeium Windsurf | JSON (`mcpServers`) | — | Windows: `%APPDATA%/Codeium/windsurf/mcp_config.json`<br>macOS/Linux: `~/.codeium/windsurf/mcp_config.json` | Global-only config managed by Codeium. |
| `opencode` | OpenCode | JSON/JSONC (`mcp`, `mcpServers`, or root map) | `opencode.json`, `opencode.jsonc` | `OPENCODE_CONFIG` override<br>`OPENCODE_CONFIG_DIR/opencode.json(c)`<br>macOS/Linux: `${XDG_CONFIG_HOME:-~/.config}/opencode/opencode.json(c)`<br>Windows: `%APPDATA%/opencode/opencode.json(c)` | Accepts comment-friendly `.jsonc` files and honors OpenCode’s precedence env vars. |
| `vscode` | VS Code MCP extension | JSON (`mcpServers` or `servers`) | — | macOS: `~/Library/Application Support/Code(/Code - Insiders)/User/mcp.json`<br>Windows: `%APPDATA%/Code(/Code - Insiders)/User/mcp.json`<br>Linux: `~/.config/Code(/Code - Insiders)/User/mcp.json` | We probe both Stable and Insiders directories; first readable file wins. |

> Claude tip: keep shared servers in `.claude/settings.json` and stash personal tweaks or credentials in `.claude/settings.local.json`, which Claude auto-ignores in git.citeturn0search0

## Default Order & Overrides

- When `config/mcporter.json` omits the `"imports"` key, we load imports in this order: `["cursor", "claude-code", "claude-desktop", "codex", "windsurf", "opencode", "vscode"]`.
- If you set a non-empty `"imports"` array, mcporter appends any missing defaults after your list, so shared presets stay available without extra JSON churn.
- Set `"imports": []` to disable auto-merging entirely (handy for CI or projects that want deterministic configs).

## Troubleshooting Tips

- Run `mcporter list --source import --json` to see exactly which external file produced each server, including the absolute path.
- If a server is defined in multiple tools (e.g., Cursor and OpenCode), the first import in the list wins. Reorder `"imports"` or copy the entry locally via `mcporter config import <kind> --copy` to break ties.
- When debugging OpenCode configs, remember that `OPENCODE_CONFIG` beats every other path. Clearing that env var or pointing it at a different file is often the quickest way to verify behavior changes.
- Tests under `tests/config-imports.test.ts` demonstrate how we mock home directories and fixtures; mirror that pattern when adding new import kinds.
