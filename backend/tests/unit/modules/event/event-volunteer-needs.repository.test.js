jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/event/event-volunteer-needs.repository');

describe('event-volunteer-needs.repository — findByEventAndJenis (Unit Test)', () => {
  it('harus mengembalikan baris kuota jika ada', async () => {
    const mockRow = { id: 1, event_id: 1, volunteer_type_id: 3, kuota: 5 };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByEventAndJenis(1, 3)).toEqual(mockRow);
  });

  it('harus mengembalikan null jika belum ada kebutuhan kuota didefinisikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByEventAndJenis(1, 3)).toBeNull();
  });
});

describe('event-volunteer-needs.repository — findByEventAndJenisForUpdate (Unit Test)', () => {
  it('harus query dengan FOR UPDATE memakai connection yang diberikan', async () => {
    const mockRow = { id: 1, event_id: 1, volunteer_type_id: 3, kuota: 1 };
    const mockConnection = { query: jest.fn().mockResolvedValue([[mockRow]]) };

    const result = await repo.findByEventAndJenisForUpdate(mockConnection, 1, 3);

    expect(result).toEqual(mockRow);
    expect(mockConnection.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
  });

  it('harus mengembalikan null jika tidak ada baris kuota', async () => {
    const mockConnection = { query: jest.fn().mockResolvedValue([[]]) };
    expect(await repo.findByEventAndJenisForUpdate(mockConnection, 1, 3)).toBeNull();
  });
});
