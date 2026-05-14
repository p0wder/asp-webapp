/**
 * Full end-to-end auth simulation — reads ADMIN_USERS from env and tests bcrypt compare.
 * Run: node --env-file=.env.local scripts/test-hash.mjs
 */
import bcrypt from 'bcryptjs';

const raw = process.env.ADMIN_USERS;
console.log('ADMIN_USERS raw (first 100 chars):', raw ? raw.substring(0, 100) : 'NOT SET');
console.log('ADMIN_USERS type:', typeof raw);
console.log('First char code:', raw ? raw.charCodeAt(0) : 'N/A');

let users = [];
try {
  users = JSON.parse(raw || '[]');
  console.log('\nParsed users:');
  users.forEach(u => {
    console.log(' -', u.email, '| hash:', u.passwordHash?.substring(0, 20) + '...', '| hash length:', u.passwordHash?.length);
  });
} catch (e) {
  console.error('JSON parse FAILED:', e.message);
  process.exit(1);
}

const testEmail = 'gramigscott@gmail.com';
const testPassword = 'W00dtree';

const user = users.find(u => u.email.toLowerCase() === testEmail.toLowerCase());
if (!user) {
  console.error('\nUser not found for email:', testEmail);
  process.exit(1);
}

console.log('\nTesting password match for:', testEmail);
const match = await bcrypt.compare(testPassword, user.passwordHash);
console.log('Password match:', match);
