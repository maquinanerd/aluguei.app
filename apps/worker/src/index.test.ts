import { describe, expect, it } from 'vitest';
import { run } from './index.js';

describe('worker run', () => {
  it('com --run-once loga, finaliza e devolve um controle sem nada para parar', async () => {
    // `run` passou a devolver o controle de parada (G3, F-5); com --run-once não há loop no ar.
    const worker = await run(['--run-once']);
    expect(typeof worker.stop).toBe('function');
    await expect(worker.stop('teste')).resolves.toBeUndefined();
  });
});
