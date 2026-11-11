import { useCallback, useEffect, useState } from 'react';

import type { ErrorCallback, Unsubscribe } from '@/types/firebase';

export type Subscribe<T> = (callback: (value: T) => void, onError: ErrorCallback) => Unsubscribe;

interface State<T> {
  source: unknown;
  data: T | undefined;
  error: Error | null;
}

/**
 * Membungkus fungsi subscribeXxx menjadi state {data, loading, error}.
 * `subscribe` HARUS stabil (fungsi modul atau useCallback) supaya listener tidak dibuat ulang
 * pada tiap render. Listener di-unsubscribe saat unmount atau saat `subscribe` berganti.
 * Pass `null` untuk menunda langganan (mis. menunggu parameter).
 */
export function useSubscription<T>(subscribe: Subscribe<T> | null) {
  const [state, setState] = useState<State<T>>({ source: null, data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe(
      (data) => setState({ source: subscribe, data, error: null }),
      (error) => setState({ source: subscribe, data: undefined, error }),
    );
  }, [subscribe, attempt]);

  const retry = useCallback(() => {
    setState({ source: null, data: undefined, error: null });
    setAttempt((n) => n + 1);
  }, []);

  const settled = subscribe !== null && state.source === subscribe;
  return {
    data: settled ? state.data : undefined,
    error: settled ? state.error : null,
    loading: subscribe !== null && !settled,
    retry,
  };
}
