import { useState } from 'react';

const MIN_BUSY_MS = 650;

export function useBusy() {
  const [busyLabel, setBusyLabel] = useState('');

  async function runBusy<T>(label: string, action: () => Promise<T>) {
    const startedAt = performance.now();
    setBusyLabel(label);
    try {
      return await action();
    } finally {
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_BUSY_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, MIN_BUSY_MS - elapsed));
      }
      setBusyLabel('');
    }
  }

  return { busyLabel, runBusy };
}
