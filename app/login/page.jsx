import { SignIn } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';

export default async function LoginPage({ searchParams }) {
  const { userId } = await auth();
  if (userId) {
    const user = await currentUser();
    if (user?.publicMetadata?.role === 'admin') redirect('/orders');
    redirect('/my-orders');
  }

  // callbackUrl comes from our proxy.js admin redirects; let Clerk handle
  // its native redirect_url (from auth.protect()) automatically.
  const forceRedirectUrl = searchParams?.callbackUrl || undefined;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--background)' }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="flex justify-center mb-8">
          <Image
            src="/thread-giant-logo-1.png"
            alt="Thread Giant"
            width={160}
            height={54}
            priority
            className="h-12 w-auto dark:invert"
          />
        </div>

        <SignIn
          forceRedirectUrl={forceRedirectUrl}
          appearance={{
            variables: {
              colorPrimary: '#00FF66',
              colorBackground: 'var(--surface)',
              colorText: 'var(--foreground)',
              colorTextSecondary: 'var(--muted)',
              colorInputBackground: 'var(--background)',
              colorInputText: 'var(--foreground)',
              borderRadius: '10px',
            },
            elements: {
              card: {
                boxShadow: 'none',
                border: '1px solid var(--border)',
                borderRadius: '12px',
              },
              headerTitle: { display: 'none' },
              headerSubtitle: { display: 'none' },
            },
          }}
        />

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--muted)' }}>
          New customer?{' '}
          <a href="/quote" style={{ color: '#00FF66', textDecoration: 'none', fontWeight: 600 }}>
            Get a free quote →
          </a>
        </p>
      </div>
    </div>
  );
}
