const prisma = require('./src/server/db');

async function truncateAll() {
  console.log('Truncating all PrivChat database tables...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tbl_chatapp_messages, tbl_chatapp_invites, tbl_chatapp_channel_members, tbl_chatapp_channels, tbl_chatapp_profiles CASCADE;`);
  console.log('Database tables successfully truncated and reset to clean state.');
  await prisma.$disconnect();
}

truncateAll().catch((err) => {
  console.error('Error truncating DB:', err);
  process.exit(1);
});
