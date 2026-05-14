/**
 * Test script to verify ADMIN_USERS env var is parsed correctly.
 * Run: node --env-file=.env.local scripts/test-auth.mjs
 */
import bcrypt from 'bcryptjs';

const raw = process.env.ADMIN_USERS;
console.log('ADMIN_USERS raw:', raw ? raw.substring(0, 80) + '...' : 'NOT SET');

let users = [];
try {
  users = JSON.parse(raw || '[]');
  console.log('Parsed users:', users.map(u => ({ email: u.email, name: u.name, hasHash: !!u.passwordHash })));
} catch (e) {
  console.error('JSON parse error:', e.message);
  process.exit(1);
}

const testEmail = 'gramigscott@gmail.com';
const testPassword = 'W00dtree!tg';

const user = users.find(u => u.email.toLowerCase() === testEmail.toLowerCase());
if (!user) {
  console.error('User not found for email:', testEmail);
  process.exit(1);
}

console.log('Found user:', user.email, '| hash starts with:', user.passwordHash?.substring(0, 10));
const match = await bcrypt.compare(testPassword, user.passwordHash);
console.log('Password match:', match);
