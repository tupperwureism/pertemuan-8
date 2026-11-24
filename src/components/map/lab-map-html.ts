const LEAFLET_CSS_URL = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_CSS_INTEGRITY = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_URL = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_JS_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

/** Membuat satu dokumen Leaflet statis. Data dinamis dikirim lewat injectJavaScript. */
export function buildLeafletHtml(): string {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link
      rel="stylesheet"
      href="${LEAFLET_CSS_URL}"
      integrity="${LEAFLET_CSS_INTEGRITY}"
      crossorigin="anonymous"
    />
    <style>
      html, body, #map {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: #e2e8f0;
      }

      .leaflet-control-attribution {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 10px;
      }
    </style>
  </head>
  <body>
    <div id="map" role="application" aria-label="Peta laboratorium"></div>
    <script
      src="${LEAFLET_JS_URL}"
      integrity="${LEAFLET_JS_INTEGRITY}"
      crossorigin="anonymous"
    ></script>
    <script>
      (function () {
        'use strict';

        var INDONESIA = [-2.5489, 118.0149];
        var map = null;
        var labLayers = null;
        var labCoordinates = [];
        var currentUserFix = null;
        var userMarker = null;
        var userAccuracyCircle = null;
        var loadErrorSent = false;

        function send(message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          }
        }

        function reportLoadError(message) {
          if (loadErrorSent) return;
          loadErrorSent = true;
          send({ type: 'LOAD_ERROR', message: message || 'Peta tidak dapat dimuat.' });
        }

        function isFiniteNumber(value) {
          return typeof value === 'number' && Number.isFinite(value);
        }

        if (!window.L) {
          reportLoadError('Leaflet gagal dimuat. Periksa koneksi internet.');
          return;
        }

        try {
          map = window.L.map('map', {
            zoomControl: true,
            attributionControl: true,
          }).setView(INDONESIA, 4);

          var tiles = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          }).addTo(map);

          tiles.once('tileerror', function () {
            reportLoadError('Tile OpenStreetMap gagal dimuat. Periksa koneksi internet.');
          });

          labLayers = window.L.layerGroup().addTo(map);

          map.on('click', function () {
            send({ type: 'SELECT_LAB', labId: null });
          });

          window.setLabs = function (labs, selectedLabId) {
            if (!map || !labLayers || !Array.isArray(labs)) return;

            labLayers.clearLayers();
            labCoordinates = [];

            labs.forEach(function (lab) {
              if (!lab || !isFiniteNumber(lab.latitude) || !isFiniteNumber(lab.longitude)) return;

              var latLng = [lab.latitude, lab.longitude];
              var isSelected = selectedLabId === lab.id;
              labCoordinates.push(latLng);

              window.L.circle(latLng, {
                radius: isFiniteNumber(lab.radiusMeter) && lab.radiusMeter > 0 ? lab.radiusMeter : 1,
                color: isSelected ? '#7c3aed' : '#2563eb',
                weight: isSelected ? 2.5 : 1.5,
                fillColor: isSelected ? '#8b5cf6' : '#3b82f6',
                fillOpacity: isSelected ? 0.18 : 0.1,
                interactive: false,
              }).addTo(labLayers);

              var marker = window.L.circleMarker(latLng, {
                radius: isSelected ? 10 : 8,
                color: '#ffffff',
                weight: 3,
                fillColor: isSelected ? '#7c3aed' : '#2563eb',
                fillOpacity: 1,
                bubblingMouseEvents: false,
              }).addTo(labLayers);

              marker.bindTooltip(String(lab.nama || 'Laboratorium'), {
                direction: 'top',
                offset: [0, -8],
              });

              marker.on('click', function (event) {
                if (event && event.originalEvent) {
                  window.L.DomEvent.stopPropagation(event.originalEvent);
                }
                send({ type: 'SELECT_LAB', labId: lab.id });
              });
            });
          };

          window.setUser = function (fix) {
            if (!map) return;

            if (!fix || !isFiniteNumber(fix.latitude) || !isFiniteNumber(fix.longitude)) {
              currentUserFix = null;
              if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
              }
              if (userAccuracyCircle) {
                map.removeLayer(userAccuracyCircle);
                userAccuracyCircle = null;
              }
              return;
            }

            currentUserFix = fix;
            var latLng = [fix.latitude, fix.longitude];

            if (userMarker) {
              userMarker.setLatLng(latLng);
            } else {
              userMarker = window.L.circleMarker(latLng, {
                radius: 7,
                color: '#ffffff',
                weight: 3,
                fillColor: '#0ea5e9',
                fillOpacity: 1,
                interactive: false,
              }).addTo(map);
            }

            var accuracy = isFiniteNumber(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : null;
            if (accuracy !== null) {
              if (userAccuracyCircle) {
                userAccuracyCircle.setLatLng(latLng);
                userAccuracyCircle.setRadius(accuracy);
              } else {
                userAccuracyCircle = window.L.circle(latLng, {
                  radius: accuracy,
                  color: '#0284c7',
                  weight: 1,
                  fillColor: '#38bdf8',
                  fillOpacity: 0.12,
                  interactive: false,
                }).addTo(map);
              }
            } else if (userAccuracyCircle) {
              map.removeLayer(userAccuracyCircle);
              userAccuracyCircle = null;
            }
          };

          window.fitAll = function () {
            if (!map) return;

            var coordinates = labCoordinates.slice();
            if (currentUserFix) {
              coordinates.push([currentUserFix.latitude, currentUserFix.longitude]);
            }

            map.invalidateSize(false);
            if (coordinates.length === 0) {
              map.setView(INDONESIA, 4);
            } else if (coordinates.length === 1) {
              map.setView(coordinates[0], 17);
            } else {
              map.fitBounds(window.L.latLngBounds(coordinates), {
                paddingTopLeft: [60, 80],
                paddingBottomRight: [60, 180],
                maxZoom: 17,
              });
            }
          };

          window.requestAnimationFrame(function () {
            map.invalidateSize(false);
            send({ type: 'READY' });
          });
        } catch (error) {
          reportLoadError(error && error.message ? error.message : 'Peta gagal diinisialisasi.');
        }
      })();
    </script>
  </body>
</html>`;
}
