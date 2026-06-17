require('dotenv').config();

const hasRedisConfig = !!process.env.REDIS_HOST && !!process.env.REDIS_PORT;

const describeIfRedis = hasRedisConfig ? describe : describe.skip;

describeIfRedis('config/redis — Integration Test (Redis Cloud nyata)', () => {
  let testRedisConnection, closeRedis, getRedisClient;

  beforeAll(() => {
    ({ testRedisConnection, closeRedis, getRedisClient } = require('../../../src/config/redis'));
  });

  afterAll(async () => {
    await closeRedis();
  });

  it('testRedisConnection harus berhasil PING ke Redis Cloud sungguhan', async () => {
    const result = await testRedisConnection();
    expect(result).toBe(true);
  }, 15000);

  it('harus bisa SET dan GET nilai sederhana', async () => {
    const client = getRedisClient();
    await client.set('test:gods-dna-cms', 'hello-redis', 'EX', 10);
    const value = await client.get('test:gods-dna-cms');

    expect(value).toBe('hello-redis');

    await client.del('test:gods-dna-cms');
  }, 15000);
});

if (!hasRedisConfig) {
  describe('config/redis — Integration Test', () => {
    it.skip('di-skip: REDIS_HOST/REDIS_PORT belum dikonfigurasi di .env', () => {});
  });
}