import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getCustomerEmail } from '@/lib/customerAuth';
import { getInvoicesByCustomerEmail } from '@/lib/printavo';
import { generateStatusToken, generateProofToken, generateQuoteApprovalToken } from '@/lib/orderStatus';
import Link from 'next/link';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

function StatusBadge({ name, color }) {
  const bg = color ? `${color}22` : 'rgba(0,255,102,0.1)';
  const fg = color || '#00FF66';
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color: fg, border: `1px solid ${fg}44`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {name || 'Unknown'}
    </span>
  );
}

export default async function MyOrdersPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const email = await getCustomerEmail(userId);
  let invoices = [];
  let error = null;

  try {
    invoices = email ? await getInvoicesByCustomerEmail(email) : [];
  } catch {
    error = 'Could not load your orders. Please try again later.';
  }

  const secret = process.env.STATUS_TOKEN_SECRET;

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem' };
  const ghostBtn = { display: 'inline-block', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--foreground)', textDecoration: 'none' };
  const greenBtn = { display: 'inline-block', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#00FF66', color: '#000', textDecoration: 'none' };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>My Orders</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Your quotes and orders with Thread Giant.</p>
      </div>

      {error && (
        <div style={{ ...card, border: '1px solid #ff4444', color: '#ff4444', padding: '1rem 1.25rem', marginBottom: '1rem' }}>{error}</div>
      )}

      {!error && invoices.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ fontSize: 16, color: 'var(--muted)', margin: '0 0 1.5rem' }}>No orders yet.</p>
          <Link href="/quote" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 50, background: '#00FF66', color: '#000', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Get a free quote →
          </Link>
        </div>
      )}

      {invoices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invoices.map((inv) => {
            const statusUrl = secret ? `/order-status?id=${inv.id}&token=${generateStatusToken(inv.id, secret)}` : null;
            const proofUrl = secret ? `/proof?id=${inv.id}&token=${generateProofToken(inv.id, secret)}` : null;
            const quoteApprovalUrl = secret ? `/quote-approval?id=${inv.id}&token=${generateQuoteApprovalToken(inv.id, secret)}` : null;
            const payUrl = `/pay?invoiceId=${inv.id}&amount=${Math.round((inv.total || 0) * 100)}`;
            const statusLower = inv.status?.name?.toLowerCase() || '';
            const showProof = statusLower.includes('art approval');
            const showApproveQuote = statusLower.includes('quote approval sent') || statusLower.includes('urgent follow up on quote');
            const showPay = inv.total != null && inv.total > 0 && !showApproveQuote;
            return (
              <div key={inv.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 2 }}>
                      {inv.nickname || '(no job name)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Order <strong style={{ color: 'var(--foreground)' }}>#{inv.visualId}</strong>
                      {inv.customerDueAt && <> · Due <strong style={{ color: 'var(--foreground)' }}>{formatDate(inv.customerDueAt)}</strong></>}
                      {inv.total != null && <> · <strong style={{ color: 'var(--foreground)' }}>{formatCurrency(inv.total)}</strong></>}
                    </div>
                  </div>
                  <StatusBadge name={inv.status?.name} color={inv.status?.color} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {statusUrl && (
                    <Link href={statusUrl} style={ghostBtn}>Track order</Link>
                  )}
                  {showApproveQuote && quoteApprovalUrl && (
                    <Link href={quoteApprovalUrl} style={greenBtn}>Approve Quote</Link>
                  )}
                  {showProof && proofUrl && (
                    <Link href={proofUrl} style={ghostBtn}>Review Proof</Link>
                  )}
                  {showPay && (
                    <Link href={payUrl} style={greenBtn}>Pay</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
