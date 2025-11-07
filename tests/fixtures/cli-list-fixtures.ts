import type { ServerDefinition } from '../../src/config.js';

process.env.MCPORTER_DISABLE_AUTORUN = '1';

export const cliModulePromise = import('../../src/cli.js');

export const stripAnsi = (value: string): string => {
  let result = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '\u001B') {
      index += 1;
      while (index < value.length && value[index] !== 'm') {
        index += 1;
      }
      index += 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
};

export const linearDefinition: ServerDefinition = {
  name: 'linear',
  description: 'Hosted Linear MCP',
  command: { kind: 'http', url: new URL('https://example.com/mcp') },
};

export const buildLinearDocumentsTool = (includeSchema?: boolean) => ({
  name: 'list_documents',
  description: "List documents in the user's Linear workspace",
  inputSchema: includeSchema
    ? {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          limit: { type: 'number', description: 'Maximum number of documents to return' },
          before: { type: 'string', description: 'Cursor to page backwards' },
          after: { type: 'string', description: 'Cursor to page forwards' },
          orderBy: {
            type: 'string',
            description: 'Sort order for the documents',
            enum: ['createdAt', 'updatedAt'],
          },
          projectId: { type: 'string', description: 'Filter by project' },
          initiativeId: { type: 'string', description: 'Filter by initiative' },
          creatorId: { type: 'string', description: 'Filter by creator' },
          includeArchived: { type: 'boolean', description: 'Whether to include archived documents' },
        },
        required: ['query'],
      }
    : undefined,
  outputSchema: includeSchema
    ? {
        title: 'DocumentConnection',
        type: 'object',
      }
    : undefined,
});
