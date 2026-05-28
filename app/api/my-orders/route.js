import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCustomerEmail } from '@/lib/customerAuth';
import { getInvoicesByCustomerEmail } from '@/lib/printavo';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = await getCustomerEmail(userId);
  if (!email) return NextResponse.json({ error: 'No email found' }, { status: 400 });
  try {
    const invoices = await getInvoicesByCustomerEmail(email);
    return NextResponse.json({ invoices });
  } catch (err) {
    console.error('[my-orders] Printavo error:', err.message);
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 502 });
  }
}
