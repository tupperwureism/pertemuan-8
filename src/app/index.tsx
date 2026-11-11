import { Redirect, type Href } from 'expo-router';

/**
 * Titik masuk. Tanpa login, Stack.Protected di root memindahkan pengguna ke /login;
 * setelah login dan profil termuat, layar ini langsung meneruskan ke jadwal.
 */
export default function Index() {
  return <Redirect href={'/jadwal' as Href} />;
}
