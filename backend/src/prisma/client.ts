import { PrismaClient as PrismaClientCtor } from '../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Narrow the constructor type so options become optional but keep the actual instance type.
type PrismaClientInstance = InstanceType<typeof PrismaClientCtor>;
const PrismaClient = PrismaClientCtor as unknown as new (options?: ConstructorParameters<typeof PrismaClientCtor>[0]) => PrismaClientInstance;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Configure SSL for RDS connection
const isLocalhost = connectionString.includes('localhost');

// Add sslmode=require to connection string (same as what works with psql)
let finalConnectionString = connectionString;
if (!isLocalhost) {
  finalConnectionString = connectionString.includes('?')
    ? `${connectionString}&sslmode=require`
    : `${connectionString}?sslmode=require`;
}

const poolConfig: any = {
  connectionString: finalConnectionString
};

// Explicitly set SSL config for RDS
if (!isLocalhost) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);

const prisma: PrismaClientInstance = new PrismaClient({
  adapter,
});

export default prisma;
