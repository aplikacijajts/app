export function uid(prefix = "id") {
  return `${prefix}_${rand(10)}_${Date.now()}`;
}

function rand(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
