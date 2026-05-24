import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId, sessionClaims } = await auth();
  const user = userId ? await currentUser() : null;

  return NextResponse.json({
    userId,
    sessionClaims,
    publicMetadata: user?.publicMetadata ?? null,
    primaryEmail: user?.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ?? null,
    roleFromClaims: sessionClaims?.metadata?.role ?? null,
    roleFromMetadata: user?.publicMetadata?.role ?? null,
    claimsKeys: sessionClaims ? Object.keys(sessionClaims) : [],
  });
}
