import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildLeafletHtml } from '@/components/map/lab-map-html';
import type { DeviceFix } from '@/services/locationService';
import type { LabDoc } from '@/types/firebase';

const WEBVIEW_USER_AGENT = 'PresensiPraktikum/1.0 (pertemuan-8)';
const WEBVIEW_BASE_URL = 'https://presensi-praktikum.local/';

type WebViewMessage =
  | { type: 'READY' }
  | { type: 'SELECT_LAB'; labId: string | null }
  | { type: 'LOAD_ERROR'; message?: string };

function scriptCall(functionName: string, ...args: unknown[]): string {
  const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(',');
  return `if (window.${functionName}) { window.${functionName}(${serializedArgs}); } true;`;
}

export function LabMap({
  labs,
  userFix,
  selectedLabId,
  onSelectLab,
}: {
  labs: LabDoc[];
  userFix: DeviceFix | null;
  selectedLabId: string | null;
  onSelectLab: (lab: LabDoc | null) => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const lastFitKeyRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const html = useMemo(() => buildLeafletHtml(), []);

  const fitKey = useMemo(
    () => `${labs.map((lab) => `${lab.id}:${lab.latitude}:${lab.longitude}`).join('|')}|user:${userFix ? 'yes' : 'no'}`,
    [labs, userFix],
  );

  useEffect(() => {
    if (!mapReady) return;
    const payload = labs.map(({ id, nama, gedung, latitude, longitude, radiusMeter }) => ({
      id,
      nama,
      gedung,
      latitude,
      longitude,
      radiusMeter,
    }));
    webViewRef.current?.injectJavaScript(scriptCall('setLabs', payload, selectedLabId));
  }, [labs, mapReady, selectedLabId]);

  useEffect(() => {
    if (!mapReady) return;
    const fix = userFix
      ? {
          latitude: userFix.latitude,
          longitude: userFix.longitude,
          accuracy: userFix.accuracy,
        }
      : null;
    webViewRef.current?.injectJavaScript(scriptCall('setUser', fix));
  }, [mapReady, userFix]);

  useEffect(() => {
    if (!mapReady) return;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    webViewRef.current?.injectJavaScript(scriptCall('fitAll'));
  }, [fitKey, mapReady]);

  const showLoadError = useCallback((message?: string) => {
    setMapReady(false);
    setLoadError(message?.trim() || 'Peta tidak dapat dimuat. Periksa koneksi internet.');
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: WebViewMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as WebViewMessage;
      } catch {
        return;
      }

      if (message.type === 'READY') {
        setLoadError(null);
        setMapReady(true);
        return;
      }
      if (message.type === 'LOAD_ERROR') {
        showLoadError(message.message);
        return;
      }
      if (message.type === 'SELECT_LAB') {
        onSelectLab(labs.find((lab) => lab.id === message.labId) ?? null);
      }
    },
    [labs, onSelectLab, showLoadError],
  );

  const retry = useCallback(() => {
    lastFitKeyRef.current = null;
    setLoadError(null);
    setMapReady(false);
    setReloadKey((value) => value + 1);
  }, []);

  return (
    <View style={styles.container}>
      {loadError ? (
        <View accessibilityRole="alert" style={styles.errorCard}>
          <Text style={styles.errorTitle}>Peta tidak dapat dimuat</Text>
          <Text style={styles.errorText}>Periksa koneksi internet.</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>Coba lagi</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ html, baseUrl: WEBVIEW_BASE_URL }}
          originWhitelist={['*']}
          userAgent={WEBVIEW_USER_AGENT}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          onMessage={handleMessage}
          onError={(event) => showLoadError(event.nativeEvent.description)}
          onHttpError={(event) =>
            showLoadError(`HTTP ${event.nativeEvent.statusCode}: ${event.nativeEvent.description}`)
          }
          style={styles.webView}
          containerStyle={styles.webViewContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E2E8F0' },
  webView: { flex: 1, backgroundColor: '#E2E8F0' },
  webViewContainer: { flex: 1 },
  errorCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '35%',
    zIndex: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 7,
    elevation: 4,
  },
  errorTitle: { color: '#991B1B', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  errorText: { color: '#7F1D1D', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: {
    marginTop: 5,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
