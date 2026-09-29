/* xlsx-mini.js — penulis berkas .xlsx mini tanpa pustaka eksternal.
   Cara kerja: membangun paket ZIP (metode "stored"/tanpa kompresi, CRC32 manual)
   yang berisi bagian-bagian wajib OOXML Spreadsheet.
   Dipakai app.js untuk "Export Excel" supaya hasilnya benar-benar .xlsx
   sehingga Excel membukanya tanpa peringatan "format dan ekstensi tidak cocok".
   Ditulis dalam format UMD supaya bisa dipakai di browser maupun diuji di Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XlsxMini = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- CRC32 (tabel 256 entri) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- util ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // 0 -> A, 1 -> B, 25 -> Z, 26 -> AA
  function colName(i) {
    var s = '';
    i = i + 1;
    while (i > 0) {
      var m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* ---------- ZIP (stored, tanpa kompresi) ---------- */
  function zipStore(files) {
    var enc = new TextEncoder();
    var DOS_DATE = ((2026 - 1980) << 9) | (9 << 5) | 29; // 29 Sep 2026
    var DOS_TIME = 0;
    var parts = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var size = data.length;
      var crc = crc32(data);

      var local = new Uint8Array(30 + name.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // signature local file header
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0x0800, true);       // flags: nama berkas memakai UTF-8
      lv.setUint16(8, 0, true);            // metode: 0 = stored
      lv.setUint16(10, DOS_TIME, true);
      lv.setUint16(12, DOS_DATE, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);        // ukuran terkompresi
      lv.setUint32(22, size, true);        // ukuran asli
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);           // extra length
      local.set(name, 30);

      var cd = new Uint8Array(46 + name.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);   // signature central directory
      cv.setUint16(4, 20, true);           // version made by (MS-DOS)
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0x0800, true);       // flags UTF-8
      cv.setUint16(10, 0, true);           // metode stored
      cv.setUint16(12, DOS_TIME, true);
      cv.setUint16(14, DOS_DATE, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);           // extra
      cv.setUint16(32, 0, true);           // comment
      cv.setUint16(34, 0, true);           // disk number
      cv.setUint16(36, 0, true);           // internal attrs
      cv.setUint32(38, 0, true);           // external attrs
      cv.setUint32(42, offset, true);      // offset header lokal
      cd.set(name, 46);

      parts.push(local, data);
      central.push(cd);
      offset += local.length + size;
    });

    var centralSize = 0;
    central.forEach(function (c) { centralSize += c.length; });

    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);     // signature end of central directory
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);        // offset central directory
    ev.setUint16(20, 0, true);             // comment length

    return new Blob(parts.concat(central).concat([end]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- potongan XML OOXML ---------- */
  var CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';

  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  function workbookXml(sheetName) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="' + esc(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>'
      + '</workbook>';
  }

  var WB_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  // style 0 = normal, 1 = tebal, 2 = tebal besar (judul)
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="13"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="3">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  function cellXml(v, ref, style) {
    if (v === null || v === undefined) v = '';
    var s = style ? ' s="' + style + '"' : '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    var str = String(v);
    if (str !== '' && /^-?\d+(\.\d+)?$/.test(str)) return '<c r="' + ref + '"' + s + '><v>' + str + '</v></c>';
    if (str === '') return '<c r="' + ref + '"' + s + '/>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">'
      + esc(str) + '</t></is></c>';
  }

  function sheetXml(rows, boldRows) {
    var maxCols = 0;
    rows.forEach(function (r) { if (r && r.length > maxCols) maxCols = r.length; });

    // lebar kolom: panjang teks terpanjang + padding, dibatasi 8..45
    var widths = [];
    for (var c = 0; c < maxCols; c++) {
      var w = 8;
      rows.forEach(function (r) {
        var v = r && r[c] !== undefined && r[c] !== null ? String(r[c]) : '';
        if (v.length + 2 > w) w = v.length + 2;
      });
      widths.push(Math.min(45, w));
    }

    var cols = '';
    if (widths.length) {
      cols = '<cols>';
      widths.forEach(function (w, i) {
        cols += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      });
      cols += '</cols>';
    }

    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + cols + '<sheetData>';

    rows.forEach(function (cells, r) {
      if (!cells || !cells.length) return;
      var rn = r + 1;
      var isBold = boldRows && boldRows.indexOf(r) >= 0;
      out += '<row r="' + rn + '">';
      cells.forEach(function (v, i) {
        out += cellXml(v, colName(i) + rn, isBold ? 1 : 0);
      });
      out += '</row>';
    });

    out += '</sheetData></worksheet>';
    return out;
  }

  /* ---------- API publik ---------- */
  // rows: array berisi array nilai per baris; opts: { sheetName, boldRows: [] }
  function buildBlob(rows, opts) {
    opts = opts || {};
    var files = [
      { name: '[Content_Types].xml', data: CT },
      { name: '_rels/.rels', data: RELS },
      { name: 'xl/workbook.xml', data: workbookXml(opts.sheetName || 'Rekap') },
      { name: 'xl/_rels/workbook.xml.rels', data: WB_RELS },
      { name: 'xl/styles.xml', data: STYLES },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows || [], opts.boldRows || []) }
    ];
    return zipStore(files);
  }

  return { build: buildBlob, crc32: crc32, zipStore: zipStore };
});
