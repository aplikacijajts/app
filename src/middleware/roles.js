export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(401).json({ error: "No role" });
    const role = String(req.user.role || "").toLowerCase();
    if (role === "superadmin") return next();
    if (!roles.includes(role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
