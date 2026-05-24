import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function CustomerLoginPage({ searchParams }) {
  // Already signed in — send straight to dashboard
  const { userId } = await auth();
  if (userId) redirect('/my-orders');

  const prefillEmail = searchParams?.email || undefined;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--background)' }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Heading above the Clerk component */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
            Track Your Order
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            Enter the email you used when placing your order. We&apos;ll send you a
            sign-in link — no password needed.
          </p>
        </div>

        <SignIn
          initialValues={prefillEmail ? { emailAddress: prefillEmail } : undefined}
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
