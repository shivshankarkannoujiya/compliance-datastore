import { execSync } from 'node:child_process';

/**
 * Applies the committed migrations to the test database (non-destructive), so tests also prove the migrations
 * apply. Each test file clears its own tables through the harness.
 */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database to run integration tests');
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
