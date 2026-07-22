import { currentUser } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { placeOrderChain } from '@/lib/placeOrderChain';

/**
 * POST /api/place-order
 *
 * Submits an SS Activewear order via `lib/ssActivewear.createSSOrder`, then
 * chains: per-invoice classification → Printavo status updates for fully-
 * ordered invoices → Order Attribution Record persistence. Returns an
 * aggregated per-invoice result.
 *
 * Heavy lifting lives in `lib/placeOrderChain.js` per Constitution Principle
 * III (thin route adapters). This handler only does auth + validation +
 * delegation + response shaping.
 *
 * Request body (extends the spec-001 shape with attribution fields):
 * {
 *   shippingAddress?: {...},
 *   lines: [{ identifier, qty, sourceInvoiceId, sourceInvoiceVisualId, sourceLineItemId, warehouseAbbr? }],
 *   poNumber?: string,
 *   comments?: string,
 *   paymentProfileId?: string
 * }
 *
 * Response shape: see `.specify/specs/002-printavo-order-notification/contracts/place-order.md`.
 */
export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const { shippingAddress, lines, poNumber, comments, paymentProfileId } = body || {};

  if (shippingAddress) {
    const required = ['name', 'address', 'city', 'state', 'zip', 'country'];
    const missing = required.filter((f) => !shippingAddress[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `shippingAddress is missing required fields: ${missing.join(', ')}` },
        { status: 400 },
      );
    }
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: 'lines must be a non-empty array of { identifier, qty, sourceInvoiceId, sourceInvoiceVisualId, sourceLineItemId } objects.' },
      { status: 400 },
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const errors = [];
    if (!l.identifier) errors.push('identifier');
    if (!l.qty || l.qty < 1) errors.push('qty (≥ 1)');
    if (!l.sourceInvoiceId) errors.push('sourceInvoiceId');
    if (!l.sourceInvoiceVisualId) errors.push('sourceInvoiceVisualId');
    if (!l.sourceLineItemId) errors.push('sourceLineItemId');
    if (errors.length) {
      return NextResponse.json(
        { error: `lines[${i}] missing or invalid: ${errors.join(', ')}` },
        { status: 400 },
      );
    }
  }

  console.log(
    '[place-order] Submitting order (testOrder=false, LIVE):',
    JSON.stringify({ poNumber, lineCount: lines.length, paymentProfileId }, null, 2),
  );

  try {
    const user = await currentUser();
    const submittedBy =
      user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user?.fullName ||
      'unknown';

    const result = await placeOrderChain({
      shippingAddress,
      lines,
      poNumber,
      comments,
      paymentProfileId,
      submittedBy,
    });
    console.log(
      '[place-order] chain complete:',
      JSON.stringify({
        ssOrderRef: result.attributionRecord.ssOrderRef,
        attribWriteOk: result.attributionRecord.writeOk,
        perInvoice: result.perInvoice.map((p) => ({
          visualId: p.sourceInvoiceVisualId,
          classification: p.classification,
          statusOutcome: p.statusUpdate?.outcome,
        })),
      }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // SS Activewear submission itself failed — no Printavo updates or
    // attribution writes were attempted (per FR-007).
    console.error('[place-order] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
