import { useCallback } from 'react';

import {
  subscribeFineById,
  subscribeMyFines,
  subscribeMyPaymentTransactions,
  subscribeTransactionsByFine,
} from '@/services/paymentService';
import type { ErrorCallback, FineDoc, PaymentTransactionDoc } from '@/types/firebase';

import { useSubscription } from './use-subscription';

export function useMyFines(uid: string | null | undefined) {
  const subscribe = useCallback(
    (cb: (fines: FineDoc[]) => void, onError: ErrorCallback) =>
      subscribeMyFines(uid ?? '', cb, onError),
    [uid],
  );
  return useSubscription(uid ? subscribe : null);
}

export function useFine(fineId: string | undefined) {
  const subscribe = useCallback(
    (cb: (fine: FineDoc | null) => void, onError: ErrorCallback) =>
      subscribeFineById(fineId ?? '', cb, onError),
    [fineId],
  );
  return useSubscription(fineId ? subscribe : null);
}

export function useMyPaymentTransactions(uid: string | null | undefined) {
  const subscribe = useCallback(
    (cb: (txs: PaymentTransactionDoc[]) => void, onError: ErrorCallback) =>
      subscribeMyPaymentTransactions(uid ?? '', cb, onError),
    [uid],
  );
  return useSubscription(uid ? subscribe : null);
}

export function useFineTransactions(fineId: string | undefined, uid: string | null | undefined) {
  const subscribe = useCallback(
    (cb: (txs: PaymentTransactionDoc[]) => void, onError: ErrorCallback) =>
      subscribeTransactionsByFine(fineId ?? '', uid ?? '', cb, onError),
    [fineId, uid],
  );
  return useSubscription(fineId && uid ? subscribe : null);
}
