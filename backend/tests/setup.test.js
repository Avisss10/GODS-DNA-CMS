describe('Project Setup Sanity Check', () => {
  it('harus berjalan dengan NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('harus bisa menjalankan assertion dasar', () => {
    expect(1 + 1).toBe(2);
  });
});