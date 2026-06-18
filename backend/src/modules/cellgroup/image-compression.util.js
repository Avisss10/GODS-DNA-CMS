const sharp = require('sharp');

const TARGET_SIZE_KB = 500; // BAGIAN 3.3: "kompres otomatis target 500 KB"
const TARGET_SIZE_BYTES = TARGET_SIZE_KB * 1024;
const MIN_QUALITY = 10; // batas bawah kualitas JPEG agar gambar tidak rusak total
const QUALITY_STEP = 10;

/**
 * Mengompres gambar (buffer) secara iteratif menurunkan kualitas
 * JPEG sampai ukurannya <= 500 KB (BAGIAN 3.3), atau sampai
 * kualitas mencapai batas bawah MIN_QUALITY (untuk menghindari
 * loop tanpa akhir pada gambar yang secara struktural sulit
 * dikompres lebih jauh, misal sudah berupa noise/random data).
 *
 * @param {Buffer} inputBuffer - buffer gambar asli (hasil upload)
 * @returns {Promise<{ buffer: Buffer, sizeKb: number, quality: number }>}
 */
async function compressToTargetSize(inputBuffer) {
  let quality = 90;
  let outputBuffer = await sharp(inputBuffer).jpeg({ quality }).toBuffer();

  while (outputBuffer.length > TARGET_SIZE_BYTES && quality > MIN_QUALITY) {
    quality -= QUALITY_STEP;
    outputBuffer = await sharp(inputBuffer).jpeg({ quality }).toBuffer();
  }

  return {
    buffer: outputBuffer,
    sizeKb: Math.round(outputBuffer.length / 1024),
    quality,
  };
}

module.exports = { compressToTargetSize, TARGET_SIZE_KB };