'use strict';

const readline = require('node:readline');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

function prompt(question, { hidden } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      // Basic masking for password entry on a TTY.
      const onData = (char) => {
        char = char.toString();
        if (char === '\n' || char === '\r' || char === '') return;
        process.stdout.write('[2K[200D' + question + Array(rl.line.length + 1).join('*'));
      };
      process.stdin.on('data', onData);
      rl.question(question, (answer) => {
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stdout.write('\n');
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  console.log('Sai Jeevan Seva admin credential generator');
  console.log('This does NOT create a user in a database - it prints values for your .env file.\n');

  const email = (await prompt('Admin email: ')).trim();
  const password = await prompt('Admin password (min 12 chars): ', { hidden: true });

  if (!email || !email.includes('@')) {
    console.error('\nA valid email is required.');
    process.exit(1);
  }
  if (!password || password.length < 12) {
    console.error('\nPassword must be at least 12 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const sessionSecret = crypto.randomBytes(48).toString('hex');

  console.log('\nAdd these to your .env file:\n');
  console.log(`ADMIN_EMAIL=${email}`);
  console.log(`ADMIN_PASSWORD_HASH=${passwordHash}`);
  console.log(`SESSION_SECRET=${sessionSecret}`);
  console.log('\nNever commit .env or share these values.');
}

main();
