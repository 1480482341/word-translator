require('dotenv').config();
const db = require('./db');

async function test() {
  await db.initDatabase();
  try {
    const daily = await db.getDailyStats();
    console.log('daily:', JSON.stringify(daily));
  } catch (err) {
    console.log('daily error:', err.message);
  }
  process.exit(0);
}
test();
