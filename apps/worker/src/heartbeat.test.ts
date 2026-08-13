import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat } from './heartbeat.js';

describe('startHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama o callback no intervalo', () => {
    const onBeat = vi.fn();
    const dispose = startHeartbeat(1000, onBeat);

    vi.advanceTimersByTime(3000);
    expect(onBeat).toHaveBeenCalledTimes(3);

    dispose();
    vi.advanceTimersByTime(2000);
    expect(onBeat).toHaveBeenCalledTimes(3);
  });
});
