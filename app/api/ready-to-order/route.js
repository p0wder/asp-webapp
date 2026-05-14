import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { gql } from '@/lib/printavo';

// Printavo status ID for "Ready to Order"
const READY_TO_ORDER_STATUS_ID = '256605';

/**
 * GET /api/ready-to-order
 *
 * Returns all Printavo invoices with status "Ready to Order".
 * Includes payment status (paidInFull, amountPaid, amountOutstanding).
 */
export async function GET() {
  // ── Auth guard: admin session required ──────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await gql(
      `query ReadyToOrderInvoices($statusIds: [ID!]) {
        invoices(first: 25, statusIds: $statusIds) {
          nodes {
            id
            visualId
            nickname
            total
            subtotal
            amountPaid
            amountOutstanding
            paidInFull
            customerDueAt
            createdAt
            productionNote
            customerNote
            tags
            status {
              id
              name
              color
            }
            contact {
              id
              fullName
              firstName
              lastName
              email
              phone
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
          totalNodes
        }
      }`,
      { statusIds: [READY_TO_ORDER_STATUS_ID] }
    );

    const invoices = data.invoices?.nodes || [];

    return NextResponse.json({
      success: true,
      total: data.invoices?.totalNodes ?? invoices.length,
      invoices,
    });
  } catch (error) {
    console.error('[ready-to-order] Error fetching invoices:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch Ready to Order invoices: ' + error.message },
      { status: 500 }
    );
  }
}
