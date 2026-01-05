import { PrismaClient as PrismaClientCtor } from '../../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Narrow the constructor type so options become optional but keep the actual instance type.
type PrismaClientInstance = InstanceType<typeof PrismaClientCtor>;
const PrismaClient = PrismaClientCtor as unknown as new (options?: ConstructorParameters<typeof PrismaClientCtor>[0]) => PrismaClientInstance;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma: PrismaClientInstance = new PrismaClient({
  adapter,
});

export default prisma;
