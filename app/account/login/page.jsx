import { redirect } from 'next/navigation';

export default function AccountLoginPage({ searchParams }) {
  const email = searchParams?.email;
  const dest = email ? `/login?email=${encodeURIComponent(email)}` : '/login';
  redirect(dest);
}
