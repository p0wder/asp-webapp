import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { fetchSSPaymentProfiles } from '@/lib/ssActivewear';

/**
 * GET /api/payment-profiles
 *
 * Returns the S&S Activewear payment profiles for the account.
 * Used by the checkout UI to let the user select a payment method.
 *
 * Response (success):
 * {
 *   success: true,
 *   profiles: [
 *     { profileID: number, profileType: string, name: string, cardNumberLast4: string }
 *   ]
 * }
 *
 * Response (error):
 * { error: string }
 */
export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const profiles = await fetchSSPaymentProfiles();
    return NextResponse.json({ success: true, profiles });
  } catch (error) {
    console.error('[payment-profiles] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
