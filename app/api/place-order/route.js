import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSSOrder } from '@/lib/ssActivewear';

/**
 * POST /api/place-order
 *
 * Places an order with S&S Activewear. testOrder is ALWAYS true (hardcoded
 * in createSSOrder) to prevent accidental real orders. Email confirmations
 * are sent to aspmerch@gmail.com and gramigscott@gmail.com.
 *
 * Request body:
 * {
 *   shippingAddress: {
 *     name: string,       // e.g. "ASP Merch"
 *     address: string,    // street address
 *     city: string,
 *     state: string,      // 2-letter abbreviation, e.g. "IL"
 *     zip: string,
 *     country: string     // e.g. "US"
 *   },
 *   lines: [
 *     {
 *       identifier: string,      // S&S SKU, e.g. "B00060043"
 *       qty: number,
 *       warehouseAbbr?: string   // optional warehouse code, e.g. "IL", "KS", "GA"
 *     }
 *   ],
 *   poNumber?: string,    // optional PO / reference number
 *   comments?: string     // optional order comments
 * }
 *
 * Response (success):
 * { success: true, order: <SS API response> }
 *
 * Response (error):
 * { error: string }
 */
export async function POST(request) {
  // ── Auth guard: admin session required ──────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const { shippingAddress, lines, poNumber, comments } = body;

    // Basic validation — shippingAddress is optional; createSSOrder defaults to the shop address
    if (shippingAddress) {
      const requiredAddressFields = ['name', 'address', 'city', 'state', 'zip', 'country'];
      const missingFields = requiredAddressFields.filter((f) => !shippingAddress[f]);
      if (missingFields.length > 0) {
        return NextResponse.json(
          { error: `shippingAddress is missing required fields: ${missingFields.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'lines must be a non-empty array of { identifier, qty } objects.' },
        { status: 400 }
      );
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.identifier) {
        return NextResponse.json(
          { error: `lines[${i}].identifier is required (e.g. "G500-S-WHITE").` },
          { status: 400 }
        );
      }
      if (!line.qty || line.qty < 1) {
        return NextResponse.json(
          { error: `lines[${i}].qty must be a positive number.` },
          { status: 400 }
        );
      }
    }

    console.log('[place-order] Submitting order (testOrder=true):', JSON.stringify({ shippingAddress, lines, poNumber, comments }, null, 2));

    const order = await createSSOrder({ shippingAddress, lines, poNumber, comments });

    console.log('[place-order] SS API response:', JSON.stringify(order, null, 2));

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('[place-order] Error:', error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
