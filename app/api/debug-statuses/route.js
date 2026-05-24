import { NextResponse } from 'next/server';
import { gql } from '@/lib/printavo';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key || key !== process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Introspect the statuses field to learn its return type shape
  const typeData = await gql(`{
    __type(name: "Query") {
      fields {
        name
        type { name kind ofType { name kind } }
        args { name type { name kind ofType { name kind } } }
      }
    }
  }`);

  const statusesField = typeData.__type?.fields?.find(f => f.name === 'statuses');

  // Try fetching statuses with minimal fields
  let statusesResult = null;
  let statusesError = null;
  try {
    const d = await gql(`{ statuses { id name color } }`);
    statusesResult = d.statuses;
  } catch (e) {
    statusesError = e.message;
  }

  // Also try nodes pattern
  let statusesNodes = null;
  let nodesError = null;
  try {
    const d = await gql(`{ statuses { nodes { id name color } } }`);
    statusesNodes = d.statuses;
  } catch (e) {
    nodesError = e.message;
  }

  return NextResponse.json({ statusesField, statusesResult, statusesError, statusesNodes, nodesError });
}
