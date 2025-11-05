# CLI Generator Plan

Default behavior: generating `<server>.ts` in the working directory if no output path is provided. Bundling is opt-in via `--bundle` and produces a single JS file with shebang; otherwise we emit TypeScript targeting Node.js.

## Goal
Create an `mcporter generate-cli` command that produces a standalone CLI for a single MCP server. The generated CLI should feel like a Unix tool: subcommands map to MCP tools, arguments translate to schema fields, and output can be piped/redirected easily.

## High-Level Requirements
- **Input**: Identify the target server either by shorthand name or by providing an explicit MCP server definition.
- **Output**: Emit a TypeScript file (ESM) targeting Node.js by default (`<server>.ts` unless `--output` overrides). Bundling to a standalone JS file happens only when `--bundle` is passed.
- **Runtime Selection**: Prefer Bun when it is available (`bun --version` succeeds); otherwise fall back to Node.js. Callers can force either runtime via `--runtime bun|node`.
- **Schema-Aware CLI**: Leverage `createServerProxy` to map positional/flag arguments to MCP tool schemas, including defaults and required validation.
- **Unix-Friendly Output**: Provide `--output text|json|markdown|raw` flags so results can be piped; default to human-readable text. Include `--timeout` (default 30s) to cap call duration.
- **Shell Completion (optional)**: Generate completion scripts for bash/zsh/fish if requested.
- **Documentation**: Update README (or similar) to show how to generate and use the CLI.

## Steps
1. **Command Scaffolding**
   - Add `generate-cli` subcommand to the existing CLI.
   - Parse flags: `--server`, `--name`, `--command`, optional `--description`, plus `--output`, `--runtime=node|bun`, `--bundle`, `--minify`, `--compile`, etc.
2. **Server Resolution**
   - If `--server` matches a configured name (via `loadServerDefinitions`), use that server definition.
   - Otherwise, if the value looks like a file path, load a Cursor-style JSON definition from disk.
   - Otherwise, attempt to parse inline JSON/JSON5.
   - Validate that a definition is found; prompt on failure.
3. **Tool Introspection**
   - Use `listTools(server, { includeSchema: true })` to inspect MCP tool schemas.
   - For each tool, extract required/optional arguments, types, and defaults.
4. **Template Generation**
   - Build a template (probably EJS or string interpolation) that:
     - Imports `createRuntime` and `createServerProxy`.
     - Creates a CLI (likely using `commander` or a minimal custom parser) with subcommands per tool.
     - Bakes in server metadata (command/url, headers, etc.) or references config path if preferred.
     - Adds output-format handling.
   - Include `package.json` scaffolding if `--bundle` or `--package` is set.
5. **Optional Bundling**
   - If requested, run esbuild to emit a single JS file with shebang (Node or Bun), with optional minification.
   - When targeting Bun, allow `--compile` to delegate to `bun build --compile` and generate a self-contained binary.
   - Otherwise, leave as TypeScript/ESM and document how to run (`node path/to/cli.js` or `bun path/to/cli.ts`).
6. **Testing**
   - Add generator unit tests (snapshot the emitted CLI for known schemas).
   - Add integration tests that run the generated script against a mock MCP server.
7. **Docs/Examples**
   - Document usage in README.
   - Provide an example generated CLI under `examples/generated/<server>.ts` (if we keep an examples directory).

## Notes
- Generated CLI depends on the latest `commander` for argument parsing.
- Default timeout for tool calls is 30 seconds, overridable via `--timeout`.
- Runtime flag remains (`--runtime bun`) to tailor shebang/usage instructions, but Node.js is the default.
- Generated CLI embeds the resolved server definition yet honors `--config`/`--server` overrides at execution time.

## Usage Examples

```bash
# Shorthand flags emit TypeScript + optional minified bundle
npx mcporter generate-cli   --name context7   --command https://mcp.context7.com/mcp   --minify

# Bun-friendly binary using --compile (requires Bun installed)
npx mcporter generate-cli   --name context7   --command https://mcp.context7.com/mcp   --runtime bun   --compile

chmod +x context7
./context7 list-tools

- `--minify` shrinks the bundled output via esbuild (output defaults to `<server>.js`).
- `--compile [path]` implies bundling and invokes `bun build --compile` to create the native executable (Bun only). When you omit the path, the compiled binary inherits the server name.
- Use `--server '{...}'` when you need advanced configuration (headers, env vars, stdio commands, OAuth metadata).
```



## Status
- ✅ `generate-cli` subcommand implemented with schema-aware proxy generation.
- ✅ Inline JSON / file / shorthand server resolution wired up.
- ✅ Bundling via esbuild (Node or Bun) with optional minification and Bun bytecode compilation.
- ✅ Integration tests cover bundling, minification, and compiled binaries against the mock MCP server.

Next steps:
1. Add optional shell completion scaffolding if demand arises.
2. Explore templated TypeScript definitions for generated CLIs to improve editor tooling.
