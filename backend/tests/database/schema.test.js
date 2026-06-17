const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../../src/database/schema.sql');

describe('Database Schema (schema.sql)', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  });

  it('file schema.sql harus ada', () => {
    expect(fs.existsSync(SCHEMA_PATH)).toBe(true);
  });

  const tables = [
    'users', 'jemaat', 'cell_group', 'cell_group_members', 'cg_meeting',
    'cg_meeting_photos', 'cg_absensi', 'volunteer_jenis', 'volunteer_members',
    'event', 'event_volunteer_needs', 'event_volunteer', 'event_attendances',
    'event_kehadiran', 'audit_logs',
  ];

  it('harus mendefinisikan tepat 15 CREATE TABLE', () => {
      const matches = sql.match(/^CREATE TABLE \w+\s*\(/gm) || [];
      expect(matches.length).toBe(15);
    });

  tables.forEach((table) => {
    it(`harus mendefinisikan tabel "${table}"`, () => {
      const regex = new RegExp(`CREATE TABLE ${table}\\s*\\(`, 'i');
      expect(sql).toMatch(regex);
    });
  });

  it('harus mendefinisikan tepat 23 FOREIGN KEY (sesuai LRS)', () => {
    const matches = sql.match(/FOREIGN KEY/g) || [];
    expect(matches.length).toBe(23);
  });

  describe('users', () => {
    it('username harus NOT NULL UNIQUE', () => {
      expect(sql).toMatch(/username\s+VARCHAR\(50\)\s+NOT NULL UNIQUE/i);
    });
    it('peran harus ENUM(LEADER, ADMIN)', () => {
      expect(sql).toMatch(/peran\s+ENUM\('LEADER','ADMIN'\) NOT NULL/i);
    });
  });

  describe('jemaat', () => {
    it('jenis_kelamin harus ENUM(L, P)', () => {
      expect(sql).toMatch(/jenis_kelamin\s+ENUM\('L','P'\) NOT NULL/i);
    });
    it('status_keaktifan harus ENUM 4 nilai sesuai BAGIAN 6.2', () => {
      expect(sql).toMatch(
        /status_keaktifan\s+ENUM\('AKTIF','KURANG_AKTIF','TIDAK_AKTIF','BELUM_CUKUP_DATA'\)/i
      );
    });
    it('skor_keaktifan harus punya CHECK BETWEEN 0 AND 100', () => {
      expect(sql).toMatch(/CHECK \(skor_keaktifan BETWEEN 0 AND 100\)/i);
    });
    it('is_non_cg harus DEFAULT TRUE', () => {
      expect(sql).toMatch(/is_non_cg\s+BOOLEAN NOT NULL DEFAULT TRUE/i);
    });
  });

  describe('cell_group', () => {
    it('leader_id harus nullable FK ke jemaat dengan ON DELETE SET NULL', () => {
      expect(sql).toMatch(/leader_id\s+INT UNSIGNED NULL/i);
      expect(sql).toMatch(
        /FOREIGN KEY \(leader_id\) REFERENCES jemaat\(id\)\s+ON DELETE SET NULL/i
      );
    });
  });

  describe('cg_meeting', () => {
    it('jenis harus ENUM(ONLINE, OFFLINE)', () => {
      expect(sql).toMatch(/jenis\s+ENUM\('ONLINE','OFFLINE'\) NOT NULL/i);
    });
  });

  describe('cg_absensi', () => {
    it('harus UNIQUE (meeting_id, jemaat_id) — upsert per BAGIAN 3.4', () => {
      expect(sql).toMatch(
        /UNIQUE KEY uq_cg_absensi_meeting_jemaat \(meeting_id, jemaat_id\)/i
      );
    });
  });

  describe('event', () => {
    it('status harus ENUM 5 siklus hidup sesuai BAGIAN 5.1', () => {
      expect(sql).toMatch(
        /status\s+ENUM\('DRAFT','PUBLISHED','AKTIF','SELESAI','DIARSIPKAN'\)/i
      );
    });
    it('absensi_status harus ENUM(OPEN, CLOSED)', () => {
      expect(sql).toMatch(/absensi_status\s+ENUM\('OPEN','CLOSED'\)/i);
    });
    it('harus punya CHECK waktu_selesai > waktu_mulai (BAGIAN 5.2)', () => {
      expect(sql).toMatch(/CHECK \(waktu_selesai > waktu_mulai\)/i);
    });
  });

  describe('event_volunteer_needs', () => {
    it('harus UNIQUE (event_id, volunteer_type_id)', () => {
      expect(sql).toMatch(
        /UNIQUE KEY uq_evn_event_jenis \(event_id, volunteer_type_id\)/i
      );
    });
  });

  describe('event_volunteer', () => {
    it('status harus ENUM(AKTIF, DIGANTIKAN, BERTUGAS_PARSIAL)', () => {
      expect(sql).toMatch(
        /status\s+ENUM\('AKTIF','DIGANTIKAN','BERTUGAS_PARSIAL'\) NOT NULL DEFAULT 'AKTIF'/i
      );
    });
    it('replacement_timing harus ENUM nullable (BAGIAN 5.6)', () => {
      expect(sql).toMatch(
        /replacement_timing\s+ENUM\('SEBELUM_EVENT','TENGAH_EVENT'\) NULL/i
      );
    });
    it('replaced_by harus nullable FK ke jemaat dengan ON DELETE SET NULL', () => {
      expect(sql).toMatch(/replaced_by\s+INT UNSIGNED NULL/i);
      expect(sql).toMatch(
        /FOREIGN KEY \(replaced_by\) REFERENCES jemaat\(id\)\s+ON DELETE SET NULL/i
      );
    });
  });

  describe('event_attendances', () => {
    it('voided_by harus nullable FK ke users dengan ON DELETE SET NULL', () => {
      expect(sql).toMatch(/voided_by\s+INT UNSIGNED NULL/i);
      expect(sql).toMatch(
        /FOREIGN KEY \(voided_by\) REFERENCES users\(id\)\s+ON DELETE SET NULL/i
      );
    });
  });

  describe('event_kehadiran', () => {
    it('event_id harus UNIQUE (upsert BAGIAN 5.8)', () => {
      expect(sql).toMatch(/event_id\s+INT UNSIGNED NOT NULL UNIQUE/i);
    });
    it('harus punya CHECK jemaat_baru <= total_hadir', () => {
      expect(sql).toMatch(/CHECK \(jemaat_baru <= total_hadir\)/i);
    });
  });

  describe('audit_logs', () => {
    it('aksi dan modul harus VARCHAR(50), bukan ENUM', () => {
      expect(sql).toMatch(/aksi\s+VARCHAR\(50\) NOT NULL/i);
      expect(sql).toMatch(/modul\s+VARCHAR\(50\) NOT NULL/i);
    });
    it('hmac_signature harus VARCHAR(64) NOT NULL (HMAC SHA-256 hex)', () => {
      expect(sql).toMatch(/hmac_signature\s+VARCHAR\(64\) NOT NULL/i);
    });
    it('data_sebelum dan data_sesudah harus JSON nullable', () => {
      expect(sql).toMatch(/data_sebelum\s+JSON NULL/i);
      expect(sql).toMatch(/data_sesudah\s+JSON NULL/i);
    });
    it('user_id harus nullable FK ke users dengan ON DELETE SET NULL', () => {
      expect(sql).toMatch(/user_id\s+INT UNSIGNED NULL/i);
      expect(sql).toMatch(
        /FOREIGN KEY \(user_id\) REFERENCES users\(id\)\s+ON DELETE SET NULL/i
      );
    });
  });
});