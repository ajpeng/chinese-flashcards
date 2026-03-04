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

// Configure SSL for RDS connection
const isLocalhost = connectionString.includes('localhost');

// Remove any sslmode parameter from connection string to avoid conflicts
let finalConnectionString = connectionString.replace(/[?&]sslmode=[^&]+/, '');

const poolConfig: any = {
  connectionString: finalConnectionString
};

// Use SSL for non-local connections.
// If an rds-ca-bundle.pem exists (legacy RDS setup), use it; otherwise rely on
// the system CA store, which works with Neon and other standard providers.
if (!isLocalhost) {
  const caPath = path.join(__dirname, '../../rds-ca-bundle.pem');
  if (fs.existsSync(caPath)) {
    poolConfig.ssl = {
      ca: fs.readFileSync(caPath).toString(),
      rejectUnauthorized: true
    };
  } else {
    poolConfig.ssl = { rejectUnauthorized: true };
  }
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);

const prisma: PrismaClientInstance = new PrismaClient({
  adapter,
});

export default prisma;
