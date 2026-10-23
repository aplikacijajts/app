const { execFileSync } = require('child_process');

function candidates(envName, command, windowsPaths = []) {
  const list = [];
  if (process.env[envName]) list.push(process.env[envName]);
  list.push(command);
  if (process.platform === 'win32') list.push(...windowsPaths);
  return [...new Set(list.filter(Boolean))];
}

function check(envName, command, args, windowsPaths = []) {
  for (const candidate of candidates(envName, command, windowsPaths)) {
    try {
      execFileSync(candidate, args, { stdio: 'ignore', timeout: 5000, windowsHide: true });
      return { ok: true, bin: candidate };
    } catch (error) {}
  }
  return { ok: false, bin: '' };
}

const pdfText = check('PDFTOTEXT_BIN', 'pdftotext', ['-v'], [
  'C:\\Program Files\\poppler\\Library\\bin\\pdftotext.exe',
  'C:\\Program Files\\poppler\\bin\\pdftotext.exe'
]);
const pdfPpm = check('PDFTOPPM_BIN', 'pdftoppm', ['-v'], [
  'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
  'C:\\Program Files\\poppler\\bin\\pdftoppm.exe'
]);
const tess = check('TESSERACT_BIN', 'tesseract', ['--version'], [
  'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
  'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
]);

const status = {
  pdftotext: pdfText.ok,
  pdftoppm: pdfPpm.ok,
  tesseract: tess.ok,
  ocr: pdfPpm.ok && tess.ok,
  binaries: {
    pdftotext: pdfText.bin,
    pdftoppm: pdfPpm.bin,
    tesseract: tess.bin
  }
};
console.log(JSON.stringify(status, null, 2));
if (!status.ocr) {
  console.log('\nScanned/image PDF auto-fill needs pdftoppm + tesseract. Text-based PDFs can still work.');
  process.exitCode = 1;
}
