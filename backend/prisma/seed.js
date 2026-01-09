// Seed script for initial Article and Word data
// Run with: npx prisma db seed

const { Pool } = require('pg');

// Validate DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Parse the DATABASE_URL and add SSL requirement
const connectionString = process.env.DATABASE_URL.includes('?')
  ? `${process.env.DATABASE_URL}&sslmode=require`
  : `${process.env.DATABASE_URL}?sslmode=require`;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  const client = await pool.connect();

  try {
    // Check if data already exists to avoid duplicates
    const { rows } = await client.query('SELECT COUNT(*) as count FROM "Article"');
    const existingArticles = parseInt(rows[0].count);

    if (existingArticles > 0) {
      console.log('Data already exists, skipping seed...');
      return;
    }

    console.log('No existing data found, proceeding with seed...');

    // Insert Article 1
    const article1Result = await client.query(`
      INSERT INTO "Article" (title, "hskLevel", content, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id
    `, ['欢迎来到中文学习应用', 1, '你好，欢迎来到中文学习应用。这是一篇简单的 HSK1 文章，让你练习常用词。']);

    const article1Id = article1Result.rows[0].id;

    // Insert words for Article 1
    await client.query(`
      INSERT INTO "Word" (simplified, pinyin, english, "hskLevel", "articleId")
      VALUES
        ($1, $2, $3, $4, $5),
        ($6, $7, $8, $9, $10),
        ($11, $12, $13, $14, $15),
        ($16, $17, $18, $19, $20),
        ($21, $22, $23, $24, $25),
        ($26, $27, $28, $29, $30)
    `, [
      '你好', 'nǐ hǎo', 'hello', 1, article1Id,
      '欢迎', 'huān yíng', 'welcome', 1, article1Id,
      '来到', 'lái dào', 'to come to / arrive', 2, article1Id,
      '中文', 'zhōng wén', 'Chinese (language)', 1, article1Id,
      '学习', 'xué xí', 'to study / to learn', 1, article1Id,
      '应用', 'yìng yòng', 'application / app', 3, article1Id
    ]);

    // Insert Article 2
    const article2Result = await client.query(`
      INSERT INTO "Article" (title, "hskLevel", content, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id
    `, ['在公园练习中文', 2, '今天天气很好，我们一起去公园练习中文。你可以大声读出来，提高发音。']);

    const article2Id = article2Result.rows[0].id;

    // Insert words for Article 2
    await client.query(`
      INSERT INTO "Word" (simplified, pinyin, english, "hskLevel", "articleId")
      VALUES
        ($1, $2, $3, $4, $5),
        ($6, $7, $8, $9, $10),
        ($11, $12, $13, $14, $15),
        ($16, $17, $18, $19, $20),
        ($21, $22, $23, $24, $25),
        ($26, $27, $28, $29, $30),
        ($31, $32, $33, $34, $35)
    `, [
      '今天', 'jīn tiān', 'today', 1, article2Id,
      '天气', 'tiān qì', 'weather', 1, article2Id,
      '很好', 'hěn hǎo', 'very good', 1, article2Id,
      '一起', 'yì qǐ', 'together', 1, article2Id,
      '公园', 'gōng yuán', 'park', 2, article2Id,
      '练习', 'liàn xí', 'to practice', 2, article2Id,
      '发音', 'fā yīn', 'pronunciation', 3, article2Id
    ]);

    console.log('Seeded articles:', { article1Id, article2Id });
    console.log('Seed completed successfully!');
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
