// Integration tests run against TEST_DATABASE_URL, never the development database.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database to run integration tests');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
