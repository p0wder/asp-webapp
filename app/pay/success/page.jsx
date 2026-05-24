import Link from 'next/link';

export default function PaySuccessPage() {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '5rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: '1rem' }}>✅</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 12px' }}>
        Payment Received
      </h1>
      <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 2rem' }}>
        Thank you! Your payment has been processed and your order has been updated.
        We&apos;ll be in touch with next steps shortly.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          href="/my-orders"
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            borderRadius: 50,
            background: '#00FF66',
            color: '#000',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          View My Orders
        </Link>
        <Link
          href="/contact"
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            borderRadius: 50,
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Contact Us
        </Link>
      </div>
    </div>
  );
}
