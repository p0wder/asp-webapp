import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAILS = ['gramigscott@gmail.com', 'aspmerch@gmail.com'];

// One-time endpoint: promotes the two admin emails, demotes everyone else.
// Protected by ADMIN_SETUP_TOKEN env var. Delete this file after use.
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!process.env.ADMIN_SETUP_TOKEN || token !== process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await clerkClient();
  const results = { promoted: [], demoted: [], notFound: [] };

  // Promote the two admin accounts
  for (const email of ADMIN_EMAILS) {
    const { data } = await client.users.getUserList({ emailAddress: [email] });
    if (!data.length) {
      results.notFound.push(email);
      continue;
    }
    await client.users.updateUser(data[0].id, { publicMetadata: { role: 'admin' } });
    results.promoted.push(email);
  }

  // Demote anyone else who currently has role: admin
  const { data: allUsers } = await client.users.getUserList({ limit: 100 });
  for (const user of allUsers) {
    if (user.publicMetadata?.role === 'admin') {
      const email = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId,
      )?.emailAddress;
      if (!ADMIN_EMAILS.includes(email)) {
        await client.users.updateUser(user.id, { publicMetadata: { role: null } });
        results.demoted.push(email ?? user.id);
      }
    }
  }

  return NextResponse.json({ success: true, results });
}
