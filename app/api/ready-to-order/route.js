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
    const invoiceFragment = `
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
      status { id name color }
      contact { id fullName firstName lastName email phone }
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
              sizes { size count }
            }
          }
        }
      }
    `;

    const allInvoices = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const data = await gql(
        `query ReadyToOrderInvoices($statusIds: [ID!], $after: String) {
          invoices(first: 50, statusIds: $statusIds, after: $after) {
            nodes { ${invoiceFragment} }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { statusIds: [READY_TO_ORDER_STATUS_ID], after: cursor }
      );

      const page = data.invoices?.nodes || [];
      allInvoices.push(...page);
      hasNextPage = data.invoices?.pageInfo?.hasNextPage ?? false;
      cursor = data.invoices?.pageInfo?.endCursor ?? null;
    }

    return NextResponse.json({
      success: true,
      total: allInvoices.length,
      invoices: allInvoices,
    });
  } catch (error) {
    console.error('[ready-to-order] Error fetching invoices:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch Ready to Order invoices: ' + error.message },
      { status: 500 }
    );
  }
}
