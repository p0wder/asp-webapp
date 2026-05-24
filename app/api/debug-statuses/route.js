import { NextResponse } from 'next/server';
import { gql } from '@/lib/printavo';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key || key !== process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Introspect root query fields to find status-related queries
  const introData = await gql(`{
    __schema {
      queryType {
        fields {
          name
        }
      }
    }
  }`);

  const fields = introData.__schema?.queryType?.fields?.map(f => f.name) || [];

  // Try any field that looks status-related
  const statusFields = fields.filter(f => f.toLowerCase().includes('status'));

  return NextResponse.json({ allQueryFields: fields, statusFields });
}
