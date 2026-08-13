import { describe, expect, it } from 'vitest';
import { run } from './index.js';

describe('worker run', () => {
  it('com --run-once loga e finaliza', async () => {
    await expect(run(['--run-once'])).resolves.toBeUndefined();
  });
});
