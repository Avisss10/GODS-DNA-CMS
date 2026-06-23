const { getPool } = require('../../config/database');

async function create(data) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO event (judul, jenis, waktu_mulai, waktu_selesai, deskripsi, status, absensi_status, created_by)
     VALUES (:judul, :jenis, :waktu_mulai, :waktu_selesai, :deskripsi, 'DRAFT', 'CLOSED', :created_by)`,
    {
      judul: data.judul,
      jenis: data.jenis,
      waktu_mulai: data.waktu_mulai,
      waktu_selesai: data.waktu_selesai,
      deskripsi: data.deskripsi ?? null,
      created_by: data.created_by,
    }
  );
  return result.insertId;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM event WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

async function findAll({ status } = {}) {
  const pool = getPool();
  if (status) {
    const [rows] = await pool.query(
      'SELECT * FROM event WHERE status = :status ORDER BY waktu_mulai DESC',
      { status }
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM event ORDER BY waktu_mulai DESC');
  return rows;
}

async function update(id, updates) {
  const pool = getPool();
  const allowed = ['judul', 'jenis', 'waktu_mulai', 'waktu_selesai', 'deskripsi', 'status', 'absensi_status'];
  const setClauses = [];
  const params = { id };

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = :${key}`);
      params[key] = updates[key];
    }
  }

  if (setClauses.length === 0) return;

  await pool.query(`UPDATE event SET ${setClauses.join(', ')} WHERE id = :id`, params);
}

module.exports = { create, findById, findAll, update };