/**
 * Helper cetak output evidence — dipakai oleh semua script di evidence/.
 * Bukan bagian dari aplikasi (src/), murni alat bantu untuk menjalankan &
 * mencatat hasil eksekusi nyata terhadap kode di src/. Hanya tampil di
 * terminal — tidak menulis file apa pun ke disk.
 */
function waktuWIB(d = new Date()) {
  return (
    d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium',
    }) + ' WIB'
  );
}

class Logger {
  constructor(name) {
    this.name = name;
    this.lines = [];
    this.scenarios = []; // { id, sesuai }
  }

  _write(line = '') {
    console.log(line);
    this.lines.push(line);
  }

  meta() {
    this._write(`Waktu eksekusi : ${waktuWIB()}`);
    this._write(`Versi Node.js  : ${process.version}`);
    this._write(`Working dir    : ${process.cwd()}`);
  }

  header(title) {
    this._write('');
    this._write('='.repeat(78));
    this._write(title);
    this._write('='.repeat(78));
  }

  sub(title) {
    this._write('');
    this._write('-'.repeat(78));
    this._write(title);
    this._write('-'.repeat(78));
  }

  info(line = '') {
    this._write(line);
  }

  kv(label, value) {
    this._write(`  ${String(label).padEnd(26)}: ${value}`);
  }

  /**
   * Cetak satu skenario uji (format seragam UT/IT/HT) dan catat status
   * sesuai/tidak untuk ringkasan akhir.
   */
  scenario({ id, judul, kondisi, hasilDiharapkan, hasilAktual, sesuai, catatan }) {
    this._write('');
    this._write(`[${id}] ${judul}`);
    this._write(`  Kondisi/Input       : ${kondisi}`);
    this._write(`  Hasil Diharapkan    : ${hasilDiharapkan}`);
    this._write(`  Hasil Aktual        : ${hasilAktual}`);
    if (catatan) this._write(`  Catatan             : ${catatan}`);
    this._write(`  Status              : ${sesuai ? '✔ SESUAI EKSPEKTASI' : '✘ TIDAK SESUAI'}`);
    this.scenarios.push({ id, sesuai });
  }

  /** Skenario yang tidak bisa dijalankan (mis. DB/Redis tidak menyala) — dicatat jujur, tidak dihitung sesuai. */
  scenarioGagalDijalankan({ id, judul, alasan }) {
    this._write('');
    this._write(`[${id}] ${judul}`);
    this._write(`  Status              : ⚠ TIDAK DAPAT DIJALANKAN (${alasan})`);
    this.scenarios.push({ id, sesuai: false, skippedInfra: true });
  }

  table(headers, rows) {
    const widths = headers.map((h, i) =>
      Math.max(String(h).length, ...rows.map((r) => String(r[i]).length))
    );
    const fmt = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
    this._write(fmt(headers));
    this._write(widths.map((w) => '-'.repeat(w)).join('-|-'));
    for (const r of rows) this._write(fmt(r));
  }

  summary() {
    const total = this.scenarios.length;
    const passed = this.scenarios.filter((s) => s.sesuai).length;
    this._write('');
    this._write(`Ringkasan ${this.name}: ${passed}/${total} skenario sesuai ekspektasi`);
    return { total, passed };
  }

  /**
   * Tidak menulis file apa pun — seluruh output sudah tampil di terminal
   * lewat console.log (lihat _write). Method ini tetap ada (no-op) supaya
   * pemanggilnya di 01-04 tidak perlu diubah.
   */
  save() {}

  /**
   * Cetak baris ringkasan mesin-terbaca untuk dipanen oleh run-all.js
   * (dijalankan sebagai child process terpisah per bagian).
   */
  emitMachineSummary(section, extra = {}) {
    const { total, passed } = this.summary();
    console.log(`__EVIDENCE_SUMMARY__ ${JSON.stringify({ section, total, passed, ...extra })}`);
    return { total, passed };
  }
}

module.exports = { Logger, waktuWIB };
