export type HeartbeatDisposer = () => void;

/** Inicia um intervalo de heartbeat. Retorna disposer para encerrar. */
export function startHeartbeat(
  intervalMs: number,
  onBeat: (tick: number) => void,
): HeartbeatDisposer {
  const interval = setInterval(() => {
    onBeat(Date.now());
  }, intervalMs);
  return () => {
    clearInterval(interval);
  };
}
