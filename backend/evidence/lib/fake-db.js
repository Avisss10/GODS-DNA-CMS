/**
 * Fake in-memory pengganti mysql2 pool, dipakai KHUSUS oleh
 * 01-unit-testing.js supaya fungsi ASLI di src/modules/*.service.js
 * bisa dieksekusi langsung tanpa koneksi MySQL/TiDB sungguhan (sesuai
 * BAGIAN III paper: unit test pakai mock, bukan DB nyata).
 *
 * Cara kerja: src/config/database.js di-require lalu properti
 * `getPool` pada module.exports-nya ditimpa dengan versi palsu SEBELUM
 * modul repository/service lain (yang melakukan
 * `const { getPool } = require('.../config/database')`) sempat
 * di-require — sehingga referensi getPool yang mereka pegang sudah
 * mengarah ke versi palsu ini. HARUS dipanggil paling pertama, sebelum
 * require lain dari src/.
 *
 * Setiap skenario mendaftarkan rules-nya sendiri lewat fakeDb.use([...]),
 * berisi { match(sql, params) => boolean, handle(sql, params) => hasil }.
 * Query yang tidak match rule manapun (termasuk rule default audit_logs
 * di bawah) akan throw error jelas — supaya query tak terduga tidak
 * diam-diam mengembalikan data kosong yang menyesatkan.
 */

let insertIdCounter = 9000;
function nextInsertId() {
  insertIdCounter += 1;
  return insertIdCounter;
}

// Query generik yang dipakai recordAuditLog (auditlog.repository.js) —
// dipasang sebagai fallback di semua skenario supaya audit log yang
// dipanggil service tidak perlu di-mock ulang setiap saat.
const AUDIT_LOG_DEFAULT_RULES = [
  {
    match: (sql) => /INSERT INTO audit_logs/i.test(sql),
    handle: () => ({ insertId: nextInsertId() }),
  },
  {
    match: (sql) => /SELECT created_at FROM audit_logs/i.test(sql),
    handle: () => [{ created_at: new Date() }],
  },
  {
    match: (sql) => /UPDATE audit_logs SET hmac_signature/i.test(sql),
    handle: () => ({ affectedRows: 1 }),
  },
];

function createRouter(rules, label) {
  const allRules = [...rules, ...AUDIT_LOG_DEFAULT_RULES];
  return async (sql, params) => {
    for (const rule of allRules) {
      if (rule.match(sql, params)) {
        return rule.handle(sql, params);
      }
    }
    throw new Error(
      `[fake-db:${label}] Tidak ada mock handler terdaftar untuk query berikut:\n` +
      `${sql}\nparams=${JSON.stringify(params)}`
    );
  };
}

function installFakeDatabase() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const dbConfig = require('../../src/config/database');

  let currentHandler = async () => {
    throw new Error('[fake-db] Handler belum diset — panggil fakeDb.use([...]) dulu.');
  };
  let currentLabel = '(belum diset)';

  const runQuery = async (sql, params) => {
    const result = await currentHandler(sql, params);
    return [result];
  };

  const fakePool = {
    query: runQuery,
    getConnection: async () => ({
      query: runQuery,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  };

  // Menimpa fungsi getPool asli — modul lain yang men-destructure getPool
  // SETELAH baris ini (yaitu semua require di bawah installFakeDatabase()
  // di 01-unit-testing.js) akan memegang referensi ke fungsi palsu ini.
  dbConfig.getPool = () => fakePool;

  return {
    use(rules, label = 'skenario') {
      currentLabel = label;
      currentHandler = createRouter(rules, currentLabel);
    },
  };
}

module.exports = { installFakeDatabase, nextInsertId };
