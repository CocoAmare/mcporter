import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseToml } from '@iarna/toml';
import { type ParseError, parse as parseJsonWithComments, printParseErrorCode } from 'jsonc-parser';
import type { ImportKind, RawEntry } from './config-schema.js';
import { RawEntrySchema } from './config-schema.js';

interface ReadExternalEntryOptions {
  readonly projectRoot?: string;
  readonly importKind?: ImportKind;
}

export function pathsForImport(kind: ImportKind, rootDir: string): string[] {
  switch (kind) {
    case 'cursor':
      return dedupePaths([
        path.resolve(rootDir, '.cursor', 'mcp.json'),
        path.join(os.homedir(), '.cursor', 'mcp.json'),
        ...defaultCursorUserConfigPaths(),
      ]);
    case 'claude-code':
      return dedupePaths([
        path.resolve(rootDir, '.claude', 'settings.local.json'),
        path.resolve(rootDir, '.claude', 'settings.json'),
        path.resolve(rootDir, '.claude', 'mcp.json'),
        path.join(os.homedir(), '.claude', 'settings.local.json'),
        path.join(os.homedir(), '.claude', 'settings.json'),
        path.join(os.homedir(), '.claude', 'mcp.json'),
        path.join(os.homedir(), '.claude.json'),
      ]);
    case 'claude-desktop':
      return [defaultClaudeDesktopConfigPath()];
    case 'codex':
      return [path.resolve(rootDir, '.codex', 'config.toml'), path.join(os.homedir(), '.codex', 'config.toml')];
    case 'windsurf':
      return defaultWindsurfConfigPaths();
    case 'opencode':
      return opencodeConfigPaths(rootDir);
    case 'vscode':
      return dedupePaths([path.resolve(rootDir, '.vscode', 'mcp.json'), ...defaultVscodeConfigPaths()]);
    default:
      return [];
  }
}

export async function readExternalEntries(
  filePath: string,
  options: ReadExternalEntryOptions = {}
): Promise<Map<string, RawEntry> | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  const buffer = await fs.readFile(filePath, 'utf8');
  if (!buffer.trim()) {
    return new Map<string, RawEntry>();
  }

  try {
    if (filePath.endsWith('.toml')) {
      const parsed = parseToml(buffer) as Record<string, unknown>;
      return extractFromCodexConfig(parsed);
    }

    const parsed = parseJsonBuffer(buffer);
    return extractFromMcpJson(parsed, options);
  } catch (error) {
    if (shouldIgnoreParseError(error)) {
      return new Map<string, RawEntry>();
    }
    throw error;
  }
}

export function toFileUrl(filePath: string): URL {
  return pathToFileURL(filePath);
}

function extractFromMcpJson(raw: unknown, options: ReadExternalEntryOptions): Map<string, RawEntry> {
  const map = new Map<string, RawEntry>();
  if (!isRecord(raw)) {
    return map;
  }

  const { importKind, projectRoot } = options;
  const descriptor = resolveContainerDescriptor(importKind);

  const containers: Record<string, unknown>[] = [];
  if (descriptor.allowMcpServers && isRecord(raw.mcpServers)) {
    containers.push(raw.mcpServers);
  }
  if (descriptor.allowServers && isRecord(raw.servers)) {
    containers.push(raw.servers);
  }
  if (descriptor.allowMcp && isRecord(raw.mcp)) {
    containers.push(raw.mcp);
  }
  if (descriptor.allowRootFallback && containers.length === 0) {
    containers.push(raw);
  }

  for (const container of containers) {
    addEntriesFromContainer(container, map);
  }

  if (projectRoot) {
    const projectEntries = extractClaudeProjectEntries(raw, projectRoot);
    for (const [name, entry] of projectEntries) {
      if (!map.has(name)) {
        map.set(name, entry);
      }
    }
  }

  return map;
}

function extractFromCodexConfig(raw: Record<string, unknown>): Map<string, RawEntry> {
  const map = new Map<string, RawEntry>();
  const serversRaw = raw.mcp_servers;
  if (!serversRaw || typeof serversRaw !== 'object') {
    return map;
  }

  for (const [name, value] of Object.entries(serversRaw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const entry = convertExternalEntry(value as Record<string, unknown>);
    if (entry) {
      map.set(name, entry);
    }
  }

  return map;
}

function convertExternalEntry(value: Record<string, unknown>): RawEntry | null {
  const result: Record<string, unknown> = {};

  if (typeof value.description === 'string') {
    result.description = value.description;
  }

  const env = asStringRecord(value.env);
  if (env) {
    result.env = env;
  }

  const headers = buildExternalHeaders(value);
  if (headers) {
    result.headers = headers;
  }

  const auth = asString(value.auth);
  if (auth) {
    result.auth = auth;
  }

  const tokenCacheDir = asString(value.tokenCacheDir ?? value.token_cache_dir ?? value.token_cacheDir);
  if (tokenCacheDir) {
    result.tokenCacheDir = tokenCacheDir;
  }

  const clientName = asString(value.clientName ?? value.client_name);
  if (clientName) {
    result.clientName = clientName;
  }

  const url = asString(value.baseUrl ?? value.base_url ?? value.url ?? value.serverUrl ?? value.server_url);
  if (url) {
    result.baseUrl = url;
  }

  const commandValue = value.command ?? value.executable;
  if (Array.isArray(commandValue) && commandValue.every((item) => typeof item === 'string')) {
    result.command = commandValue;
  } else if (typeof commandValue === 'string') {
    result.command = commandValue;
  }

  if (Array.isArray(value.args) && value.args.every((item) => typeof item === 'string')) {
    result.args = value.args;
  }

  const hasHttpTarget = typeof result.baseUrl === 'string';
  const hasCommandTarget =
    typeof result.command === 'string' || (Array.isArray(result.command) && result.command.length > 0);
  if (!hasHttpTarget && !hasCommandTarget) {
    return null;
  }

  const parsed = RawEntrySchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

function buildExternalHeaders(record: Record<string, unknown>): Record<string, string> | undefined {
  const headers: Record<string, string> = {};

  const literalHeaders = asStringRecord(record.headers);
  if (literalHeaders) {
    Object.assign(headers, literalHeaders);
  }

  const bearerToken = asString(record.bearerToken ?? record.bearer_token);
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const bearerTokenEnv = asString(record.bearerTokenEnv ?? record.bearer_token_env);
  if (bearerTokenEnv) {
    headers.Authorization = `$env:${bearerTokenEnv}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function extractClaudeProjectEntries(raw: Record<string, unknown>, projectRoot: string): Map<string, RawEntry> {
  const map = new Map<string, RawEntry>();
  if (!isRecord(raw.projects)) {
    return map;
  }
  const projects = raw.projects as Record<string, unknown>;
  const targetPath = normalizeProjectPath(projectRoot);
  for (const [projectKey, value] of Object.entries(projects)) {
    if (!isRecord(value) || !isRecord(value.mcpServers)) {
      continue;
    }
    const normalizedKey = normalizeProjectPath(projectKey);
    if (!pathsEqual(normalizedKey, targetPath)) {
      continue;
    }
    addEntriesFromContainer(value.mcpServers as Record<string, unknown>, map);
  }
  return map;
}

function addEntriesFromContainer(container: Record<string, unknown>, target: Map<string, RawEntry>): void {
  for (const [name, value] of Object.entries(container)) {
    if (!isRecord(value)) {
      continue;
    }
    if (target.has(name)) {
      continue;
    }
    const entry = convertExternalEntry(value);
    if (entry) {
      target.set(name, entry);
    }
  }
}

function resolveContainerDescriptor(importKind: ImportKind | undefined): {
  allowMcpServers: boolean;
  allowServers: boolean;
  allowMcp: boolean;
  allowRootFallback: boolean;
} {
  if (importKind === 'opencode') {
    return {
      allowMcpServers: false,
      allowServers: false,
      allowMcp: true,
      allowRootFallback: false,
    };
  }
  return {
    allowMcpServers: true,
    allowServers: true,
    allowMcp: true,
    allowRootFallback: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeProjectPath(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return path.resolve(expandHomeShortcut(input));
}

function expandHomeShortcut(input: string): string {
  if (input === '~') {
    return os.homedir();
  }
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function pathsEqual(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  if (process.platform === 'win32') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function defaultCursorUserConfigPaths(): string[] {
  const paths: string[] = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  paths.push(path.join(os.homedir(), '.cursor', 'mcp.json'));
  if (xdg && xdg.length > 0) {
    paths.push(path.join(xdg, 'Cursor', 'User', 'mcp.json'));
  }
  if (process.platform === 'darwin') {
    paths.push(path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json'));
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    paths.push(path.join(appData, 'Cursor', 'User', 'mcp.json'));
  } else {
    paths.push(path.join(os.homedir(), '.config', 'Cursor', 'User', 'mcp.json'));
  }
  return dedupePaths(paths);
}

function defaultClaudeDesktopConfigPath(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function defaultWindsurfConfigPaths(): string[] {
  const homeDir = os.homedir();
  const paths = [
    path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json'),
    path.join(homeDir, '.codeium', 'windsurf-next', 'mcp_config.json'),
    path.join(homeDir, '.windsurf', 'mcp_config.json'),
    path.join(homeDir, '.config', '.codeium', 'windsurf', 'mcp_config.json'),
  ];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming');
    paths.push(path.join(appData, 'Codeium', 'windsurf', 'mcp_config.json'));
  }
  return dedupePaths(paths);
}

function opencodeConfigPaths(rootDir: string): string[] {
  const paths: string[] = [];
  const explicitConfig = process.env.OPENCODE_CONFIG;
  if (explicitConfig && explicitConfig.length > 0) {
    paths.push(explicitConfig);
  }

  paths.push(path.resolve(rootDir, 'opencode.jsonc'), path.resolve(rootDir, 'opencode.json'));

  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (configDir && configDir.length > 0) {
    paths.push(path.join(configDir, 'opencode.jsonc'), path.join(configDir, 'opencode.json'));
  }

  for (const dir of defaultOpencodeConfigDirs()) {
    paths.push(path.join(dir, 'opencode.jsonc'), path.join(dir, 'opencode.json'));
  }

  return dedupePaths(paths);
}

function defaultOpencodeConfigDirs(): string[] {
  const dirs: string[] = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    dirs.push(path.join(xdg, 'opencode'));
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    dirs.push(path.join(appData, 'opencode'));
  } else {
    dirs.push(path.join(os.homedir(), '.config', 'opencode'));
  }
  return dirs;
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of paths) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}

function defaultVscodeConfigPaths(): string[] {
  if (process.platform === 'darwin') {
    return [
      path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User', 'mcp.json'),
    ];
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return [path.join(appData, 'Code', 'User', 'mcp.json'), path.join(appData, 'Code - Insiders', 'User', 'mcp.json')];
  }
  return [
    path.join(os.homedir(), '.config', 'Code', 'User', 'mcp.json'),
    path.join(os.homedir(), '.config', 'Code - Insiders', 'User', 'mcp.json'),
  ];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asStringRecord(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string') {
      record[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      record[key] = String(value);
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function shouldIgnoreParseError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  return 'fromTOML' in error;
}

function parseJsonBuffer(buffer: string): unknown {
  const errors: ParseError[] = [];
  const parsed = parseJsonWithComments(buffer, errors, { allowTrailingComma: true, disallowComments: false });
  const firstError = errors[0];
  if (firstError) {
    const { error, offset } = firstError;
    const message = `${printParseErrorCode(error)}${typeof offset === 'number' ? ` at offset ${offset}` : ''}`;
    throw new SyntaxError(message);
  }
  return parsed;
}
