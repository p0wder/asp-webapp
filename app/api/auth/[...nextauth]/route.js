import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

/**
 * Admin users are stored as a JSON array in the ADMIN_USERS env var.
 * Each user: { email, passwordHash, name, role }
 *
 * To generate a passwordHash, run:
 *   node scripts/hash-password.mjs yourpassword
 *
 * Example ADMIN_USERS value (set in .env.local and Vercel env vars):
 * [{"email":"gramigscott@gmail.com","passwordHash":"$2b$12$...","name":"Scott","role":"admin"},{"email":"aspmerch@gmail.com","passwordHash":"$2b$12$...","name":"Terry","role":"admin"}]
 */
function getAdminUsers() {
  try {
    return JSON.parse(process.env.ADMIN_USERS || '[]');
  } catch {
    console.error('[auth] Failed to parse ADMIN_USERS env var — must be valid JSON array');
    return [];
  }
}

export const authOptions = {
  providers: [
    // ── Google OAuth (uncomment when ready) ──────────────────────────────────
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // }),

    // ── Email + Password (bcrypt) ────────────────────────────────────────────
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'you@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const users = getAdminUsers();
        const user = users.find(
          (u) => u.email.toLowerCase() === credentials.email.toLowerCase()
        );

        if (!user) {
          console.warn('[auth] Login attempt for unknown email:', credentials.email);
          return null;
        }

        const passwordMatch = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!passwordMatch) {
          console.warn('[auth] Bad password for:', credentials.email);
          return null;
        }

        return {
          id: user.email,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // Persist role into the JWT on first sign-in
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose role on the session object
      if (session.user) {
        session.user.role = token.role;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
