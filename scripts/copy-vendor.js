// Copies the PDF engine (pdf.js) into src/vendor so the app works offline.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
const to = path.join(__dirname, '..', 'src', 'vendor');
if (!fs.existsSync(from)) { console.log('pdfjs-dist not installed yet, skipping'); process.exit(0); }

fs.mkdirSync(to, { recursive: true });
for (const f of ['pdf.min.js', 'pdf.worker.min.js']) {
  fs.copyFileSync(path.join(from, 'build', f), path.join(to, f));
}
for (const dir of ['cmaps', 'standard_fonts']) {
  fs.cpSync(path.join(from, dir), path.join(to, dir), { recursive: true });
}
// pdf-lib powers the PDF tools (merge, split, compress, watermark…).
const pdfLib = path.join(__dirname, '..', 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js');
if (fs.existsSync(pdfLib)) fs.copyFileSync(pdfLib, path.join(to, 'pdf-lib.min.js'));
console.log('Copied pdf.js into src/vendor');
