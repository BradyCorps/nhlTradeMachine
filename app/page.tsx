// app/page.tsx — redirects to /players (canonical Player Analytics page)
// players/page.tsx is the authoritative implementation.
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/players');
}