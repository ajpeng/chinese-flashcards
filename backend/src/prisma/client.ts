import { PrismaClient as PrismaClientCtor } from '../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

// Narrow the constructor type so options become optional but keep the actual instance type.
type PrismaClientInstance = InstanceType<typeof PrismaClientCtor>;
const PrismaClient = PrismaClientCtor as unknown as new (options?: ConstructorParameters<typeof PrismaClientCtor>[0]) => PrismaClientInstance;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const isLocalhost = connectionString.includes('localhost');

// For legacy RDS connections (identified by a custom CA bundle), strip sslmode
// from the URL and configure SSL programmatically with the CA cert.
// For all other providers (Neon, etc.), pass the connection string as-is so
// that URL params like sslmode=require and channel_binding=require are respected.
const poolConfig: any = { connectionString };

if (!isLocalhost) {
  const caPath = path.join(__dirname, '../../rds-ca-bundle.pem');
  if (fs.existsSync(caPath)) {
    const parsedUrl = new URL(connectionString);
    parsedUrl.searchParams.delete('sslmode');
    poolConfig.connectionString = parsedUrl.toString();
    poolConfig.ssl = {
      ca: fs.readFileSync(caPath).toString(),
      rejectUnauthorized: true,
    };
  }
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);

const prisma: PrismaClientInstance = new PrismaClient({
  adapter,
});

export default prisma;
