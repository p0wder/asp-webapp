import { NextResponse } from 'next/server';
import { gql } from '@/lib/printavo';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key || key !== process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
