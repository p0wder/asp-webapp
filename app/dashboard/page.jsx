import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const user = await currentUser();
  if (user?.publicMetadata?.role === 'admin') redirect('/orders');
  redirect('/');
}
