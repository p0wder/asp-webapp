import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { gql, READY_TO_ORDER_STATUS_ID } from '@/lib/printavo';

const INVOICE_FRAGMENT = `
  id visualId nickname total subtotal amountPaid amountOutstanding paidInFull
  customerDueAt createdAt productionNote customerNote tags
  status { id name color }
  contact { id fullName firstName lastName email phone }
  lineItemGroups {
    nodes {
      id
      lineItems {
        nodes { id description itemNumber color price items sizes { size count } }
      }
    }
  }
`;

/**
 * GET /api/ready-to-order?cursor=<endCursor>
 *
 * Returns one page (4 invoices) of "Ready to Order" invoices plus cursor info
 * so the client can implement infinite scroll without hitting Printavo's
 * 25 000-complexity cap.
 */
export async function GET(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') || null;

  try {
    const data = await gql(
      `query ReadyToOrderInvoices($statusIds: [ID!], $after: String) {
        invoices(first: 4, statusIds: $statusIds, after: $after) {
          nodes { ${INVOICE_FRAGMENT} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { statusIds: [READY_TO_ORDER_STATUS_ID], after: cursor },
    );

    return NextResponse.json({
      success: true,
      invoices: data.invoices?.nodes || [],
      hasNextPage: data.invoices?.pageInfo?.hasNextPage ?? false,
      endCursor: data.invoices?.pageInfo?.endCursor ?? null,
    });
  } catch (error) {
    console.error('[ready-to-order] Error fetching invoices:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch Ready to Order invoices: ' + error.message },
      { status: 500 },
    );
  }
}
