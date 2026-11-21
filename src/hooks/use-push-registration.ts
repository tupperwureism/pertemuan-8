import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import {
  registerPushToken,
  resetPushRegistrationAttempt,
  subscribeNotificationNavigation,
  type PushRegistrationResult,
} from '@/services/pushTokenService';

export type PushRegistrationStatus =
  | 'checking'
  | 'registered'
  | 'denied'
  | 'blocked'
  | 'unsupported'
  | 'error';

function toState(result: PushRegistrationResult): { status: PushRegistrationStatus; message: string } {
  if (result.ok) return { status: 'registered', message: '' };
  switch (result.reason) {
    case 'DENIED':
      return { status: 'denied', message: result.message };
    case 'BLOCKED':
      return { status: 'blocked', message: result.message };
    case 'UNSUPPORTED_DEVICE':
      return { status: 'unsupported', message: result.message };
    default:
      return { status: 'error', message: result.message };
  }
}

export function usePushRegistration() {
  const { uid } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    uid: string | null;
    status: PushRegistrationStatus;
    message: string;
  }>({
    uid: null,
    status: 'checking',
    message: '',
  });

  useEffect(() => subscribeNotificationNavigation(), []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    registerPushToken().then((result) => {
      if (active) setState({ uid, ...toState(result) });
    });
    return () => {
      active = false;
    };
  }, [attempt, uid]);

  const retry = useCallback(() => {
    resetPushRegistrationAttempt();
    setState({ uid, status: 'checking', message: '' });
    setAttempt((value) => value + 1);
  }, [uid]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const visibleState = state.uid === uid ? state : { status: 'checking' as const, message: '' };
  return { status: visibleState.status, message: visibleState.message, retry, openSettings };
}
