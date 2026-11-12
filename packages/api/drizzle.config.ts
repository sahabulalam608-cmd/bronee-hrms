import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'expo',
  dbCredentials: {
    url: 'file:./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/bronee_hrms.sqlite',
  },
});
