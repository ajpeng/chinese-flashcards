import { PrismaClient as PrismaClientCtor } from '../../generated/prisma/client';

// Narrow the constructor type so options become optional but keep the actual instance type.
type PrismaClientInstance = InstanceType<typeof PrismaClientCtor>;
const PrismaClient = PrismaClientCtor as unknown as new () => PrismaClientInstance;

const prisma: PrismaClientInstance = new PrismaClient();

export default prisma;
