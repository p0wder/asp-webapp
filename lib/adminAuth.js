import { currentUser } from '@clerk/nextjs/server';

export async function requireAdmin() {
  const user = await currentUser();
  return user?.publicMetadata?.role === 'admin';
}
