import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const tokenFromHeader = h.startsWith("Bearer ") ? h.slice(7) : null;
  const tokenFromQuery = req.query?.token || null;

  const token = tokenFromHeader || tokenFromQuery;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
