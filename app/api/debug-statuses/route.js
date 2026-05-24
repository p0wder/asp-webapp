import { NextResponse } from 'next/server';
import { gql } from '@/lib/printavo';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key || key !== process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pull statuses from both quotes and invoices (last 100 each)
  const [quotesData, invoicesData] = await Promise.all([
    gql(`{ quotes(first: 100) { nodes { status { id name color } } } }`),
    gql(`{ invoices(first: 100) { nodes { status { id name color } } } }`).catch(() => ({ invoices: { nodes: [] } })),
  ]);

  const seen = new Map();
  for (const node of [...(quotesData.quotes?.nodes || []), ...(invoicesData.invoices?.nodes || [])]) {
    if (node.status?.id) seen.set(node.status.id, node.status);
  }

  return NextResponse.json([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
}
