import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Mirror the app's env loading: .env.test under NODE_ENV=test, .env otherwise.
// Real environment variables always take precedence over the file.
config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  quiet: true,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
