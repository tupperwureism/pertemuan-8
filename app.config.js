/**
 * Melengkapi app.json (yang dibaca sebagai `config`). Dipisah karena app.json tidak dapat membaca
 * environment variable, sedangkan Google Maps API key tidak boleh masuk Git.
 *
 * Isi GOOGLE_MAPS_API_KEY sebagai EAS environment variable (build cloud) atau di shell/`.env.local`
 * saat `npx expo prebuild`/build lokal. Tanpa key, peta di Android tampil kosong.
 */
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  if (!mapsKey && process.env.EAS_BUILD) {
    console.warn('[app.config] GOOGLE_MAPS_API_KEY kosong: peta Android tidak akan tampil pada build ini.');
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey: mapsKey }],
    ],
  };
};
