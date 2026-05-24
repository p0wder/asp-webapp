import { NextResponse } from 'next/server';
import { getInvoiceById } from '@/lib/printavo';
import { verifyStatusToken } from '@/lib/orderStatus';

// HMAC token signed at quote submission prevents enumeration of invoice IDs
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const token = searchParams.get('token');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  let invoice;
  try {
    invoice = await getInvoiceById(id);
  } catch (err) {
    console.error('[order-status] Printavo error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 502 });
  }

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const secret = process.env.STATUS_TOKEN_SECRET;
  if (!verifyStatusToken(id, token, secret)) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 403 });
  }

  return NextResponse.json({
    status: invoice.status ? { name: invoice.status.name, color: invoice.status.color } : null,
    customerName: invoice.contact?.fullName ?? null,
    jobName: invoice.nickname ?? null,
    createdAt: invoice.createdAt ?? null,
    dueAt: invoice.customerDueAt ?? null,
    total: invoice.total ?? null,
    visualId: invoice.visualId ?? null,
  });
}
