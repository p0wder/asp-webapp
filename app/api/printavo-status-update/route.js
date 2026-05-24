import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import {
  getInvoicesByIds,
  setInvoiceStatus,
  READY_TO_ORDER_STATUS_ID,
  GOODS_IN_TRANSIT_STATUS_ID,
} from '@/lib/printavo';

/**
 * POST /api/printavo-status-update
 *
 * Idempotent retry endpoint for failed Printavo invoice status updates
 * (FR-010, US4). Allows the confirmation screen to surface a per-invoice
 * retry control that does NOT re-submit the SS Activewear order.
 *
 * Contract: `.specify/specs/002-printavo-order-notification/contracts/printavo-status-update.md`
 *
 * Defence-in-depth auth per Principle VII:
 *   - Matcher entry in `proxy.js` (admin-gated edge auth) — already present.
 *   - `requireAdmin()` below.
 *
 * Route stays thin per Principle III: auth → validate → delegate to
 * `lib/printavo.js` → respond.
 */

// In-code allow-list of target statuses. Phase 1 only allows the
// Ready-to-Order → Goods-In-Transit transition. Adding new transitions is
// a deliberate code edit, mirroring the safety pattern in `setInvoiceStatus`.
const ALLOWED_TARGET_STATUS_IDS = new Set([GOODS_IN_TRANSIT_STATUS_ID]);

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

  const { invoiceId, targetStatusId } = body || {};

  if (typeof invoiceId !== 'string' || invoiceId.trim().length === 0) {
    return NextResponse.json(
      { error: 'invoiceId is required and must be a non-empty string' },
      { status: 400 },
    );
  }
  if (typeof targetStatusId !== 'string' || !ALLOWED_TARGET_STATUS_IDS.has(targetStatusId)) {
    return NextResponse.json(
      { error: 'targetStatusId not in allow-list' },
      { status: 400 },
    );
  }

  console.log(
    `[printavo-status-update] retry requested for invoice ${invoiceId} target ${targetStatusId}`,
  );

  try {
    // Fetch the current Printavo status. Reuse `getInvoicesByIds` (single
    // ID batch); the response includes `{ id, visualId, status, lineItems }`
    // — we only consume `status` here.
    const invoices = await getInvoicesByIds([invoiceId]);
    const invoice = invoices[0];
    if (!invoice) {
      console.error(`[printavo-status-update] outcome: failed (invoice not found ${invoiceId})`);
      return NextResponse.json(
        { error: `Invoice not found: ${invoiceId}` },
        { status: 500 },
      );
    }

    const currentStatus = invoice.status;

    // Idempotency:
    //   (a) already in or past target — no-op success.
    //   (b) currently not in "Ready to Order" — admin moved it; no-op.
    if (
      currentStatus?.id === targetStatusId ||
      currentStatus?.id !== READY_TO_ORDER_STATUS_ID
    ) {
      console.log(
        `[printavo-status-update] outcome: skipped (currentStatus=${currentStatus?.id} target=${targetStatusId})`,
      );
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'already-in-or-past-target',
        currentStatus,
      });
    }

    // Perform the update via the lib client (which enforces its own
    // allow-list and DRY_RUN gate per Principle VI).
    const result = await setInvoiceStatus(invoiceId, targetStatusId);
    console.log(`[printavo-status-update] outcome: updated invoice=${invoiceId}`);
    return NextResponse.json({
      ok: true,
      skipped: false,
      previousStatus: currentStatus,
      newStatus: result?.status || { id: targetStatusId, name: 'Goods In Transit' },
    });
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[printavo-status-update] outcome: failed ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
