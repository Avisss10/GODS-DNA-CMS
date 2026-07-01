const { parseStatements } = require('../../../src/database/migration-runner');

describe('migration-runner — parseStatements (Unit Test)', () => {
  it('harus memecah SQL menjadi statement berdasarkan delimiter ";"', () => {
    const sql = `CREATE TABLE a (id INT); CREATE TABLE b (id INT);`;
    const result = parseStatements(sql);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/CREATE TABLE a/);
    expect(result[1]).toMatch(/CREATE TABLE b/);
  });

  it('harus mengabaikan baris komentar (diawali --)', () => {
    const sql = `
      -- ini komentar
      CREATE TABLE a (id INT);
      -- komentar lain, harus diabaikan
    `;
    const result = parseStatements(sql);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toMatch(/komentar/);
  });

  it('harus mengabaikan statement kosong dari baris kosong berlebih', () => {
    const sql = `CREATE TABLE a (id INT);


    ;;;

    CREATE TABLE b (id INT);`;
    const result = parseStatements(sql);

    expect(result).toHaveLength(2);
  });

  it('harus mem-trim whitespace di awal/akhir setiap statement', () => {
    const sql = `   CREATE TABLE a (id INT)   ;   `;
    const result = parseStatements(sql);

    expect(result[0]).toBe('CREATE TABLE a (id INT)');
  });

  it('harus mengembalikan array kosong jika input hanya komentar/whitespace', () => {
    const sql = `
      -- hanya komentar
      -- tidak ada statement
    `;
    const result = parseStatements(sql);

    expect(result).toEqual([]);
  });

  it('harus berhasil mem-parsing keseluruhan schema.sql nyata menjadi tepat 16 CREATE TABLE', () => {
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(
      __dirname,
      '../../../src/database/schema.sql'
    );
    const sqlContent = fs.readFileSync(schemaPath, 'utf-8');

    const statements = parseStatements(sqlContent);
    const createTableStatements = statements.filter((s) =>
      /^CREATE TABLE \w+/.test(s)
    );

    expect(createTableStatements).toHaveLength(16);
  });
});