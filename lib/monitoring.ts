type StatEntry = {
  count: number;
  totalMs: number;
};

const KEY = 'lune_monitoring_stats';

const load = (): Record<string, StatEntry> => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const save = (stats: Record<string, StatEntry>) => {
  try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch {}
};

export const recordEvent = (name: string, ms: number = 0) => {
  const stats = load();
  const cur = stats[name] || { count: 0, totalMs: 0 };
  cur.count += 1;
  cur.totalMs += ms;
  stats[name] = cur;
  save(stats);
};

export const recordTiming = (name: string, ms: number) => {
  recordEvent(name, ms);
};

export const getStats = () => load();