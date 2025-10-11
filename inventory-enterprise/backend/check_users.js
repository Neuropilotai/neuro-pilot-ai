#!/usr/bin/env node
const auth = require('./middleware/auth');

console.log('Users in auth system:');
console.log('Total users:', auth.users.size);
console.log('');

for (const [email, user] of auth.users) {
  console.log('Email:', email);
  console.log('User ID:', user.id);
  console.log('Role:', user.role);
  console.log('Name:', user.firstName, user.lastName);
  console.log('---');
}
