import { currentUser } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { placeOrderChain } from '@/lib/placeOrderChain';

const VALID_VENDORS = new Set(['ss-activewear', 'sanmar']);

/**
 * POST /api/place-order
 *
 * Splits the submitted lines by `vendor` and submits an S&S Activewear order
 * (`lib/ssActivewear.createSSOrder`) and/or a SanMar purchase order
 * (`lib/sanmar/purchaseOrder.submitSanMarPO`) — both vendors are ordered
 * identically from the buyer's perspective. Then chains: per-invoice
 * classification → Printavo status updates for fully-ordered invoices →
 * Order Attribution Record persistence (one per vendor that succeeded).
 * Returns an aggregated per-invoice result.
 *
 * Heavy lifting lives in `lib/placeOrderChain.js` per Constitution Principle
 * III (thin route adapters). This handler only does auth + validation +
 * delegation + response shaping.
 *
 * Request body (extends the spec-001 shape with attribution fields):
 * {
 *   shippingAddress?: {...},        // S&S Activewear ship-to
 *   sanmarShipTo?: {...},           // required if any line has vendor 'sanmar'
 *   lines: [{ identifier, vendor, qty, styleNumber?, color?, size?, sourceInvoiceId, sourceInvoiceVisualId, sourceLineItemId, warehouseAbbr? }],
 *   poNumber?: string,
 *   comments?: string,
 *   paymentProfileId?: string
 * }
 *
 * Response shape: see `.specify/specs/002-printavo-order-notification/contracts/place-order.md`.
 * If one vendor succeeds and the other fails, the response is still 200 with
 * an `errors` block — a successful order must never be hidden behind an
 * overall failure.
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

  const { shippingAddress, sanmarShipTo, lines, poNumber, comments, paymentProfileId } = body || {};

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
      { error: 'lines must be a non-empty array of { identifier, vendor, qty, sourceInvoiceId, sourceInvoiceVisualId, sourceLineItemId } objects.' },
      { status: 400 },
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const errors = [];
    if (!l.identifier) errors.push('identifier');
    if (!VALID_VENDORS.has(l.vendor)) errors.push(`vendor (must be one of: ${Array.from(VALID_VENDORS).join(', ')})`);
    if (!l.qty || l.qty < 1) errors.push('qty (≥ 1)');
    if (!l.sourceInvoiceId) errors.push('sourceInvoiceId');
    if (!l.sourceInvoiceVisualId) errors.push('sourceInvoiceVisualId');
    if (!l.sourceLineItemId) errors.push('sourceLineItemId');
    if (l.vendor === 'sanmar' && (!l.styleNumber || !l.color || !l.size)) {
      errors.push('styleNumber, color, and size (required for SanMar lines)');
    }
    if (errors.length) {
      return NextResponse.json(
        { error: `lines[${i}] missing or invalid: ${errors.join(', ')}` },
        { status: 400 },
      );
    }
  }

  const hasSanmarLines = lines.some((l) => l.vendor === 'sanmar');
  if (hasSanmarLines) {
    const required = ['shipAddress1', 'shipCity', 'shipState', 'shipZip'];
    const missing = required.filter((f) => !sanmarShipTo?.[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `sanmarShipTo is missing required fields: ${missing.join(', ')}` },
        { status: 400 },
      );
    }
  }

  console.log(
    '[place-order] Submitting order:',
    JSON.stringify({
      poNumber,
      lineCount: lines.length,
      ssLineCount: lines.filter((l) => l.vendor === 'ss-activewear').length,
      sanmarLineCount: lines.filter((l) => l.vendor === 'sanmar').length,
      paymentProfileId,
    }, null, 2),
  );

  try {
    const user = await currentUser();
    const submittedBy =
      user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user?.fullName ||
      'unknown';

    const result = await placeOrderChain({
      shippingAddress,
      sanmarShipTo,
      lines,
      poNumber,
      comments,
      paymentProfileId,
      submittedBy,
    });
    console.log(
      '[place-order] chain complete:',
      JSON.stringify({
        attributionRecords: result.attributionRecords.map((r) => ({
          vendor: r.vendor,
          ssOrderRef: r.ssOrderRef,
          writeOk: r.writeOk,
        })),
        errors: result.errors,
        perInvoice: result.perInvoice.map((p) => ({
          visualId: p.sourceInvoiceVisualId,
          classification: p.classification,
          statusOutcome: p.statusUpdate?.outcome,
        })),
      }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Both vendors failed (or the only vendor submitted to failed) — no
    // Printavo updates or attribution writes were attempted (per FR-007).
    console.error('[place-order] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
