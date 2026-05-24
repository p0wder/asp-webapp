import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function MyOrdersPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '5rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: '1rem' }}>✅</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 12px' }}>
        Authentication works!
      </h1>
      <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 8px' }}>
        Signed in as
      </p>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#00FF66', margin: '0 0 2rem', fontFamily: 'monospace' }}>
        {email}
      </p>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        Full order dashboard coming in Wave 3.
      </p>
    </div>
  );
}
