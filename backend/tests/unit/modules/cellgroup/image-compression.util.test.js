const sharp = require('sharp');
const { compressToTargetSize, TARGET_SIZE_KB } = require('../../../../src/modules/cellgroup/image-compression.util');

describe('image-compression.util — compressToTargetSize (Unit Test)', () => {
  it('harus mengompres gambar besar menjadi <= 500KB', async () => {
    // Generate gambar acak berukuran besar (1200x1200, noise) agar
    // ukuran awal pasti jauh di atas 500KB sebelum kompresi.
    const largeImageBuffer = await sharp({
      create: {
        width: 1200, height: 1200, channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    }).jpeg({ quality: 100 }).toBuffer();

    const result = await compressToTargetSize(largeImageBuffer);

    expect(result.sizeKb).toBeLessThanOrEqual(TARGET_SIZE_KB);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  }, 20000);

  it('harus mengembalikan quality yang dipakai', async () => {
    const imageBuffer = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 50, g: 50, b: 50 } },
    }).jpeg({ quality: 100 }).toBuffer();

    const result = await compressToTargetSize(imageBuffer);

    expect(result.quality).toBeGreaterThanOrEqual(10);
    expect(result.quality).toBeLessThanOrEqual(90);
  }, 20000);

  it('gambar yang sudah kecil tidak perlu diturunkan kualitasnya jauh', async () => {
    const smallImageBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).jpeg({ quality: 100 }).toBuffer();

    const result = await compressToTargetSize(smallImageBuffer);

    expect(result.sizeKb).toBeLessThanOrEqual(TARGET_SIZE_KB);
  }, 20000);
});