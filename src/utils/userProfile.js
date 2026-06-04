export const SELF_REGISTRATION_ROLES = ["driver", "dispatcher", "broker"];
export const ADMIN_USER_ROLES = ["driver", "dispatcher", "broker", "admin", "superadmin"];

export const TRAILER_TYPES = [
  "dry-van",
  "reefer",
  "flatbed",
  "step-deck",
  "conestoga",
  "box-truck",
  "power-only",
  "container",
  "tanker",
  "other"
];

export function cleanString(value, max = 160) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeEmail(value) {
  return cleanString(value, 254).toLowerCase();
}

export function parseOwnerFlag(value) {
  if (value === true || value === false) return value;
  const v = cleanString(value, 24).toLowerCase();
  if (["true", "yes", "y", "1", "owner", "owner-operator", "owner_operator", "да", "da"].includes(v)) return true;
  if (["false", "no", "n", "0", "company-driver", "company_driver", "не", "ne"].includes(v)) return false;
  return null;
}

export function normalizeRole(value, allowedRoles, fallback = "driver") {
  const role = cleanString(value || fallback, 32).toLowerCase();
  return allowedRoles.includes(role) ? role : null;
}

function splitName(fullName) {
  const parts = cleanString(fullName, 160).split(" ").filter(Boolean);
  if (parts.length < 2) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function normalizeAccountPayload(body = {}, options = {}) {
  const allowedRoles = options.allowedRoles || SELF_REGISTRATION_ROLES;
  const requirePassword = options.requirePassword !== false;
  const defaultRole = options.defaultRole || "driver";
  const role = normalizeRole(body.requestedRole || body.role || defaultRole, allowedRoles, defaultRole);

  const fromName = splitName(body.name);
  const firstName = cleanString(body.firstName || fromName.firstName, 80);
  const lastName = cleanString(body.lastName || fromName.lastName, 80);
  const email = normalizeEmail(body.email);
  const phone = cleanString(body.phone, 40);
  const isDriverRole = (role || defaultRole) === "driver";
  const parsedOwner = parseOwnerFlag(body.isOwner ?? body.owner ?? body.ownerOperator);
  const isOwner = isDriverRole ? parsedOwner : null;
  const trailerType = isDriverRole ? cleanString(body.trailerType, 80).toLowerCase() : "";
  const password = requirePassword ? String(body.password || "") : null;

  const errors = [];
  if (!firstName) errors.push("First name is required");
  if (!lastName) errors.push("Last name is required");
  if (!email) errors.push("Email is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
  if (!phone) errors.push("Phone is required");
  else if (phone.replace(/[^0-9]/g, "").length < 6) errors.push("Valid phone number is required");
  if (!role) errors.push("Valid role is required");
  if (isDriverRole && isOwner === null) errors.push("Owner status is required for drivers");
  if (isDriverRole && !trailerType) errors.push("Trailer type is required for drivers");
  if (requirePassword) {
    if (!password) errors.push("Password is required");
    else if (password.length < 6) errors.push("Password must be at least 6 characters");
  }

  const normalized = {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email,
    phone,
    companyId: isDriverRole ? (cleanString(body.companyId, 80) || "jts-logistics") : "jts-logistics",
    companyName: isDriverRole ? (cleanString(body.companyName || body.company, 120) || null) : null,
    address: cleanString(body.address, 180) || null,
    role: role || defaultRole,
    requestedRole: role || defaultRole,
    isOwner,
    trailerType: trailerType || null,
    truckNumber: isDriverRole ? (cleanString(body.truckNumber || body.unitNumber, 80) || null) : null,
    trailerNumber: isDriverRole ? (cleanString(body.trailerNumber, 80) || null) : null,
    mcNumber: isDriverRole ? (cleanString(body.mcNumber, 80) || null) : null,
    dotNumber: isDriverRole ? (cleanString(body.dotNumber, 80) || null) : null,
    notes: cleanString(body.notes, 500) || null
  };

  return { ok: errors.length === 0, errors, data: normalized, password };
}

export function ownerLabel(value) {
  if (value === true) return "Owner";
  if (value === false) return "Company driver";
  return "Not specified";
}
