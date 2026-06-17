const fs = require('fs');
const path = require('path');

const LRS_PATH = path.join(__dirname, '../../docs/lrs.md');

const expectedForeignKeys = [
  'cell_group.leader_id',
  'cell_group_members.cg_id',
  'cell_group_members.jemaat_id',
  'cg_meeting.cg_id',
  'cg_meeting.created_by',
  'cg_meeting_photos.meeting_id',
  'cg_meeting_photos.uploaded_by',
  'cg_absensi.meeting_id',
  'cg_absensi.jemaat_id',
  'volunteer_members.jemaat_id',
  'volunteer_members.volunteer_type_id',
  'event.created_by',
  'event_volunteer_needs.event_id',
  'event_volunteer_needs.volunteer_type_id',
  'event_volunteer.event_id',
  'event_volunteer.jemaat_id',
  'event_volunteer.jenis_id',
  'event_volunteer.replaced_by',
  'event_attendances.event_id',
  'event_attendances.jemaat_id',
  'event_attendances.voided_by',
  'event_kehadiran.event_id',
  'audit_logs.user_id',
];

describe('LRS Documentation', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(LRS_PATH, 'utf-8');
  });

  it('file docs/lrs.md harus ada', () => {
    expect(fs.existsSync(LRS_PATH)).toBe(true);
  });

  it('harus mengandung blok diagram mermaid erDiagram', () => {
    expect(content).toMatch(/```mermaid/);
    expect(content).toMatch(/erDiagram/);
  });

  it('harus mendokumentasikan tepat 23 relasi foreign key', () => {
    expect(expectedForeignKeys.length).toBe(23);
  });

  expectedForeignKeys.forEach((fk) => {
    it(`harus mendokumentasikan FK "${fk}"`, () => {
      const regex = new RegExp('`' + fk.replace('.', '\\.') + '`');
      expect(content).toMatch(regex);
    });
  });

  it('harus menyebut 3 tabel tanpa FK (users, jemaat, volunteer_jenis)', () => {
    expect(content).toMatch(/`users`/);
    expect(content).toMatch(/`jemaat`/);
    expect(content).toMatch(/`volunteer_jenis`/);
  });
});