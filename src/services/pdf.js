import fs from "fs/promises";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 46;

const CYR = {
  А:"A", а:"a", Б:"B", б:"b", В:"V", в:"v", Г:"G", г:"g", Д:"D", д:"d", Ѓ:"Gj", ѓ:"gj", Е:"E", е:"e", Ж:"Zh", ж:"zh", З:"Z", з:"z", Ѕ:"Dz", ѕ:"dz", И:"I", и:"i", Ј:"J", ј:"j", К:"K", к:"k", Л:"L", л:"l", Љ:"Lj", љ:"lj", М:"M", м:"m", Н:"N", н:"n", Њ:"Nj", њ:"nj", О:"O", о:"o", П:"P", п:"p", Р:"R", р:"r", С:"S", с:"s", Т:"T", т:"t", Ќ:"Kj", ќ:"kj", У:"U", у:"u", Ф:"F", ф:"f", Х:"H", х:"h", Ц:"C", ц:"c", Ч:"Ch", ч:"ch", Џ:"Dz", џ:"dz", Ш:"Sh", ш:"sh"
};

function latinize(value = "") {
  return String(value ?? "")
    .replace(/[А-ШЃЌЅЈЉЊЏа-шѓќѕјљњџ]/g, ch => CYR[ch] || ch)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function escText(value) {
  return latinize(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value, maxChars = 80) {
  const words = latinize(value).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { width: 383, height: 182 };
}

function pdfDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `D:${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function money(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return raw;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fieldRows(data) {
  const rows = [
    ["Confirmation No.", data.confirmationNumber || data.reference || ""],
    ["Date", data.confirmationDate || new Date().toLocaleDateString("en-US")],
    ["Load Number", data.loadNumber || ""],
    ["Customer / Broker", data.customer || data.brokerName || ""],
    ["Contact", [data.contactName, data.contactPhone, data.contactEmail].filter(Boolean).join(" | ")],
    ["Pickup", data.pickup || ""],
    ["Delivery", data.delivery || ""],
    ["Driver", data.driverName || ""],
    ["Truck / Trailer", [data.truckNumber && `Truck ${data.truckNumber}`, data.trailerNumber && `Trailer ${data.trailerNumber}`].filter(Boolean).join(" | ")],
    ["Rate", money(data.rate) || data.rate || ""],
    ["Commodity", data.commodity || ""],
    ["Weight", data.weight || ""],
    ["Pickup Date/Time", data.pickupDate || ""],
    ["Delivery Date/Time", data.deliveryDate || ""]
  ];
  return rows.filter(([, value]) => String(value || "").trim());
}

export async function buildConfirmationPdf(data = {}, { logoPath = "public/assets/jts-logo-pdf.jpg" } = {}) {
  const logo = await fs.readFile(logoPath).catch(() => null);
  const size = logo ? jpegSize(logo) : null;
  const content = [];
  const cmd = (s) => content.push(s + "\n");
  const text = (x, y, value, sizePt = 10, font = "F1", color = "0.08 0.13 0.14") => {
    cmd(`BT /${font} ${sizePt} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escText(value)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2, color = "0.78 0.87 0.87", width = 1) => cmd(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (x, y, w, h, color = "0.94 0.98 0.98") => cmd(`${color} rg ${x} ${y} ${w} ${h} re f`);

  rect(0, PAGE_H - 112, PAGE_W, 112, "0.95 0.99 0.99");
  cmd(`0.00 0.66 0.66 rg 0 ${PAGE_H - 116} ${PAGE_W} 6 re f`);
  if (logo && size) {
    const drawW = 155;
    const drawH = drawW * size.height / size.width;
    cmd(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${M} ${(PAGE_H - 92).toFixed(2)} cm /I1 Do Q`);
  } else {
    text(M, PAGE_H - 70, "JTS", 34, "F2", "0.00 0.66 0.66");
  }
  text(PAGE_W - 238, PAGE_H - 55, "JTS LOGISTICS INC", 16, "F2", "0.12 0.16 0.17");
  text(PAGE_W - 238, PAGE_H - 76, "Professional Load Confirmation", 10, "F1", "0.33 0.40 0.42");

  text(M, PAGE_H - 150, "RATE / LOAD CONFIRMATION", 20, "F2", "0.12 0.16 0.17");
  text(M, PAGE_H - 169, "Generated from the JTS Logistics Portal", 10, "F1", "0.38 0.45 0.47");
  line(M, PAGE_H - 188, PAGE_W - M, PAGE_H - 188, "0.00 0.66 0.66", 1.4);

  let y = PAGE_H - 218;
  const rows = fieldRows(data);
  for (const [label, value] of rows) {
    rect(M, y - 7, 150, 23, "0.92 0.98 0.98");
    text(M + 10, y, label, 9, "F2", "0.12 0.16 0.17");
    const lines = wrapText(value, 72);
    text(M + 170, y, lines[0], 10, "F1", "0.08 0.13 0.14");
    line(M, y - 11, PAGE_W - M, y - 11);
    y -= 28;
    for (const extra of lines.slice(1, 3)) {
      text(M + 170, y, extra, 10, "F1", "0.08 0.13 0.14");
      y -= 16;
    }
    if (y < 150) break;
  }

  const notes = String(data.notes || data.instructions || "").trim();
  if (notes && y > 128) {
    y -= 12;
    text(M, y, "Special Instructions / Notes", 12, "F2", "0.12 0.16 0.17");
    y -= 18;
    rect(M, y - 50, PAGE_W - (M * 2), 62, "0.97 0.99 0.99");
    for (const l of wrapText(notes, 96).slice(0, 5)) {
      text(M + 12, y, l, 9.5, "F1", "0.08 0.13 0.14");
      y -= 13;
    }
  }

  line(M, 98, PAGE_W - M, 98, "0.78 0.87 0.87", 1);
  text(M, 76, "Authorized JTS Logistics confirmation document", 9, "F2", "0.12 0.16 0.17");
  text(M, 60, "This document was generated electronically and is valid without a handwritten signature unless otherwise required.", 8, "F1", "0.38 0.45 0.47");
  text(PAGE_W - 210, 60, `Generated: ${new Date().toLocaleString("en-US")}`, 8, "F1", "0.38 0.45 0.47");

  const contentBuffer = Buffer.from(content.join(""), "binary");
  const objects = [];
  const add = (num, body) => objects.push({ num, body: Buffer.isBuffer(body) ? body : Buffer.from(String(body), "binary") });

  add(1, "<< /Type /Catalog /Pages 2 0 R >>");
  add(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${logo ? "/XObject << /I1 6 0 R >>" : ""} >> /Contents 7 0 R >>`);
  add(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  if (logo && size) add(6, Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, "binary"), logo, Buffer.from("\nendstream", "binary")]));
  else add(6, "<< >>");
  add(7, Buffer.concat([Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, "binary"), contentBuffer, Buffer.from("endstream", "binary")]));
  add(8, `<< /Title (${escText("JTS Load Confirmation")}) /Producer (${escText("JTS Logistics Portal")}) /CreationDate (${pdfDate()}) >>`);

  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  let pos = chunks[0].length;
  for (const obj of objects.sort((a,b) => a.num - b.num)) {
    offsets[obj.num] = pos;
    const head = Buffer.from(`${obj.num} 0 obj\n`, "binary");
    const tail = Buffer.from("\nendobj\n", "binary");
    chunks.push(head, obj.body, tail);
    pos += head.length + obj.body.length + tail.length;
  }
  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "binary"));
  return Buffer.concat(chunks);
}
