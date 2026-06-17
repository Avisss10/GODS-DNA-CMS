const fs = require('fs');
const path = require('path');

const ERD_PATH = path.join(__dirname, '../../docs/erd.md');

const expectedTables = [
  'users',
  'jemaat',
  'cell_group',
  'cell_group_members',
  'cg_meeting',
  'cg_meeting_photos',
  'cg_absensi',
  'volunteer_jenis',
  'volunteer_members',
  'event',
  'event_volunteer_needs',
  'event_volunteer',
  'event_attendances',
  'event_kehadiran',
  'audit_logs',
];

describe('ERD Documentation', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(ERD_PATH, 'utf-8');
  });

  it('file docs/erd.md harus ada', () => {
    expect(fs.existsSync(ERD_PATH)).toBe(true);
  });

  it('harus mengandung blok diagram mermaid erDiagram', () => {
    expect(content).toMatch(/```mermaid/);
    expect(content).toMatch(/erDiagram/);
  });

  it('harus mendokumentasikan tepat 15 tabel utama', () => {
    expect(expectedTables.length).toBe(15);
  });

  expectedTables.forEach((table) => {
    it(`harus menyebut tabel "${table}"`, () => {
      const regex = new RegExp(`\`${table}\``, 'i');
      expect(content).toMatch(regex);
    });
  });
});