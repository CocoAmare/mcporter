import { describe, expect, it, vi } from 'vitest';
import { printCallOutput } from '../src/cli/output-utils.js';

describe('printCallOutput raw output', () => {
  it('does not truncate long strings when printing raw output', () => {
    const longText = 'x'.repeat(15000);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const wrapped = {
      json: () => null,
      markdown: () => null,
      text: () => null,
    };

    try {
      printCallOutput(wrapped as any, { t: longText }, 'raw');

      expect(log).toHaveBeenCalledTimes(1);
      const logged = log.mock.calls[0][0] as string;
      expect(logged).not.toContain('... 5000 more characters');
      expect(logged).toContain(longText.slice(-50));
    } finally {
      log.mockRestore();
    }
  });
});
