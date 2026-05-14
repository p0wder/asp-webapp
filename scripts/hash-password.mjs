/**
 * Generate a bcrypt hash for a password.
 * Usage: node scripts/hash-password.mjs yourpassword
 *
 * Copy the output hash into ADMIN_USERS in .env.local and Vercel env vars.
 */
import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs <password>');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log('\nBcrypt hash (12 rounds):');
console.log(hash);
console.log('\nPaste this into ADMIN_USERS as the "passwordHash" value.\n');
