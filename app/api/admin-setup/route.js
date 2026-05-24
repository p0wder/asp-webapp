import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// One-time endpoint to promote the signed-in user to admin.
// Protected by ADMIN_SETUP_TOKEN env var. Delete this file after use.
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!process.env.ADMIN_SETUP_TOKEN || token !== process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in — log in first, then revisit this URL' }, { status: 401 });
  }

  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { role: 'admin' },
  });

  return NextResponse.json({
    success: true,
    userId,
    message: 'Admin role set. You can now delete app/api/admin-setup/route.js',
  });
}
