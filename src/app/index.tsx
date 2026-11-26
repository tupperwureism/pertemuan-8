import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/**
 * Titik masuk. Tanpa login, Stack.Protected di root memindahkan pengguna ke /login;
 * setelah login dan profil termuat, Aslab diarahkan ke /aslab dan peran lain ke /jadwal.
 */
export default function Index() {
  const { role } = useAuth();
  if (role === 'aslab') {
    return <Redirect href={'/aslab' as Href} />;
  }
  return <Redirect href={'/jadwal' as Href} />;
}
