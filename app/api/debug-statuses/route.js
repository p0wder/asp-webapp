import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { gql } from '@/lib/printavo';

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await gql(`{
    statuses {
      nodes {
        id
        name
        color
        isDefault
        isArchived
      }
    }
  }`);

  return NextResponse.json(data.statuses?.nodes || []);
}
