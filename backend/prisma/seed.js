// Seed script for initial Article and Word data
// Run with: npx prisma db seed

const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg(process.env.DATABASE_URL);

const prisma = new PrismaClient({ adapter });

async function main() {
  // Optional: clear existing data to avoid duplicates when re-seeding
  try {
    console.log('Attempting to clear existing data...');
    await prisma.word.deleteMany();
    await prisma.article.deleteMany();
    console.log('Successfully cleared existing data.');
  } catch (error) {
    console.log('Could not clear existing data (permissions issue), continuing with seed...');
    console.log('Error:', error.message);
  }

  const article1 = await prisma.article.create({
    data: {
      title: '欢迎来到中文学习应用',
      hskLevel: 1,
      content:
        '你好，欢迎来到中文学习应用。这是一篇简单的 HSK1 文章，让你练习常用词。',
    },
  });

  await prisma.word.createMany({
    data: [
      {
        simplified: '你好',
        pinyin: 'nǐ hǎo',
        english: 'hello',
        hskLevel: 1,
        articleId: article1.id,
      },
      {
        simplified: '欢迎',
        pinyin: 'huān yíng',
        english: 'welcome',
        hskLevel: 1,
        articleId: article1.id,
      },
      {
        simplified: '来到',
        pinyin: 'lái dào',
        english: 'to come to / arrive',
        hskLevel: 2,
        articleId: article1.id,
      },
      {
        simplified: '中文',
        pinyin: 'zhōng wén',
        english: 'Chinese (language)',
        hskLevel: 1,
        articleId: article1.id,
      },
      {
        simplified: '学习',
        pinyin: 'xué xí',
        english: 'to study / to learn',
        hskLevel: 1,
        articleId: article1.id,
      },
      {
        simplified: '应用',
        pinyin: 'yìng yòng',
        english: 'application / app',
        hskLevel: 3,
        articleId: article1.id,
      },
    ],
  });

  const article2 = await prisma.article.create({
    data: {
      title: '在公园练习中文',
      hskLevel: 2,
      content:
        '今天天气很好，我们一起去公园练习中文。你可以大声读出来，提高发音。',
    },
  });

  await prisma.word.createMany({
    data: [
      {
        simplified: '今天',
        pinyin: 'jīn tiān',
        english: 'today',
        hskLevel: 1,
        articleId: article2.id,
      },
      {
        simplified: '天气',
        pinyin: 'tiān qì',
        english: 'weather',
        hskLevel: 1,
        articleId: article2.id,
      },
      {
        simplified: '很好',
        pinyin: 'hěn hǎo',
        english: 'very good',
        hskLevel: 1,
        articleId: article2.id,
      },
      {
        simplified: '一起',
        pinyin: 'yì qǐ',
        english: 'together',
        hskLevel: 1,
        articleId: article2.id,
      },
      {
        simplified: '公园',
        pinyin: 'gōng yuán',
        english: 'park',
        hskLevel: 2,
        articleId: article2.id,
      },
      {
        simplified: '练习',
        pinyin: 'liàn xí',
        english: 'to practice',
        hskLevel: 2,
        articleId: article2.id,
      },
      {
        simplified: '发音',
        pinyin: 'fā yīn',
        english: 'pronunciation',
        hskLevel: 3,
        articleId: article2.id,
      },
    ],
  });

  console.log('Seeded articles:', { article1Id: article1.id, article2Id: article2.id });
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
