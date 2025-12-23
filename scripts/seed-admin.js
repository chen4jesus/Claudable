
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Matching the hashing logic in lib/auth.ts
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const username = 'root';
  const password = 'root';
  const hashedPassword = hashPassword(password);

  console.log(`Seeding user: ${username}...`);

  const user = await prisma.user.upsert({
    where: { username },
    update: { 
      password: hashedPassword,
      role: 'admin'
    },
    create: {
      username,
      password: hashedPassword,
      role: 'admin'
    },
  });

  console.log(`User ${user.username} seeded successfully.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
