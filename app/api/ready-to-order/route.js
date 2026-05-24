import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { gql, READY_TO_ORDER_STATUS_ID } from '@/lib/printavo';

/**
 * GET /api/ready-to-order
 *
 * Returns all Printavo invoices with status "Ready to Order".
 * Includes payment status (paidInFull, amountPaid, amountOutstanding).
 */
export async function GET() {
  // ── Auth guard: admin session required ──────────────────────────────────
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await gql(
      `query ReadyToOrderInvoices($statusIds: [ID!]) {
        invoices(first: 4, statusIds: $statusIds) {
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
            lineItemGroups {
              nodes {
                id
                lineItems {
                  nodes {
                    id
                    description
                    itemNumber
                    color
                    price
                    items
                    sizes {
                      size
                      count
                    }
                  }
                }
              }
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
