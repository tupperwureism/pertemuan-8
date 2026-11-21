import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type LatLng, type Region } from 'react-native-maps';

import type { DeviceFix } from '@/services/locationService';
import type { LabDoc } from '@/types/firebase';

const INDONESIA_REGION: Region = {
  latitude: -2.5489,
  longitude: 118.0149,
  latitudeDelta: 35,
  longitudeDelta: 35,
};

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
  const mapRef = useRef<MapView>(null);
  const lastFitKeyRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const fitKey = useMemo(
    () => `${labs.map((lab) => `${lab.id}:${lab.latitude}:${lab.longitude}`).join('|')}|user:${userFix ? 'yes' : 'no'}`,
    [labs, userFix],
  );

  useEffect(() => {
    if (!mapReady) return;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    const labCoordinates: LatLng[] = labs.map((lab) => ({
      latitude: lab.latitude,
      longitude: lab.longitude,
    }));
    const coordinates = userFix
      ? [...labCoordinates, { latitude: userFix.latitude, longitude: userFix.longitude }]
      : labCoordinates;

    if (coordinates.length > 1) {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 80, right: 60, bottom: 180, left: 60 },
        animated: true,
      });
    } else if (coordinates.length === 1) {
      mapRef.current?.animateToRegion(
        { ...coordinates[0], latitudeDelta: 0.01, longitudeDelta: 0.01 },
        450,
      );
    } else {
      mapRef.current?.animateToRegion(INDONESIA_REGION, 450);
    }
  }, [fitKey, labs, mapReady, userFix]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={INDONESIA_REGION}
      onMapReady={() => setMapReady(true)}
      onPress={() => onSelectLab(null)}
      showsCompass
      toolbarEnabled={false}
    >
      {labs.map((lab) => (
        <Fragment key={lab.id}>
          <Circle
            center={{ latitude: lab.latitude, longitude: lab.longitude }}
            radius={lab.radiusMeter}
            fillColor="rgba(37, 99, 235, 0.10)"
            strokeColor="rgba(37, 99, 235, 0.55)"
            strokeWidth={1.5}
          />
          <Marker
            coordinate={{ latitude: lab.latitude, longitude: lab.longitude }}
            title={lab.nama}
            description={lab.gedung}
            pinColor={selectedLabId === lab.id ? '#7C3AED' : '#2563EB'}
            onPress={(event) => {
              event.stopPropagation();
              onSelectLab(lab);
            }}
          />
        </Fragment>
      ))}

      {userFix ? (
        <Marker
          coordinate={{ latitude: userFix.latitude, longitude: userFix.longitude }}
          title="Posisi Anda"
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={20}
        >
          <View style={styles.userMarkerOuter}>
            <View style={styles.userMarkerInner} />
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  userMarkerOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  userMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
