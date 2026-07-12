/**
 * JSON.stringify yang stabil terhadap urutan key object. TiDB menyimpan
 * kolom bertipe JSON dengan key dialfabetkan ulang saat disimpan (mis.
 * `{judul,jenis,status}` yang di-INSERT bisa terbaca kembali sebagai
 * `{jenis,judul,status}`). Tanpa normalisasi ini, HMAC yang ditandatangani
 * dari object asli di memori (saat INSERT) tidak akan cocok lagi saat
 * diverifikasi dari object hasil baca ulang DB — padahal datanya sama
 * persis, cuma urutan key-nya berubah. Array TIDAK di-sort (urutan
 * elemen array bermakna), hanya key object yang di-sort.
 *
 * @param {*} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

module.exports = { stableStringify };
