import { readJson } from "./jsonStore.js";

export async function getAssignedDriverIdsForDispatcher(dispatcherId) {
  const assignments = await readJson("assignments.json");
  return assignments
    .filter(a => a.dispatcherId === dispatcherId)
    .flatMap(a => Array.isArray(a.driverIds) ? a.driverIds : [])
    .filter(Boolean);
}

export async function getDispatcherIdsForDriver(driverId) {
  const assignments = await readJson("assignments.json");
  return assignments
    .filter(a => Array.isArray(a.driverIds) && a.driverIds.includes(driverId))
    .map(a => a.dispatcherId)
    .filter(Boolean);
}

export async function isDriverAssignedToDispatcher(dispatcherId, driverId) {
  if (!dispatcherId || !driverId) return false;
  const assigned = await getAssignedDriverIdsForDispatcher(dispatcherId);
  return assigned.includes(driverId);
}

export async function canAccessDriver(user, driverId) {
  if (!user || !driverId) return false;
  if (["admin", "superadmin"].includes(user.role)) return true;
  if (user.role === "driver") return user.sub === driverId;
  if (user.role === "broker") return true;
  if (user.role === "dispatcher") return isDriverAssignedToDispatcher(user.sub, driverId);
  return false;
}

export async function filterLoadsForUser(user, loads) {
  if (!Array.isArray(loads)) return [];
  if (!user) return [];
  if (["admin", "superadmin"].includes(user.role)) return loads;
  if (user.role === "driver") return loads.filter(l => l.driverId === user.sub);
  if (user.role === "dispatcher") return loads;
  if (user.role === "broker") return loads.filter(l => l.brokerId === user.sub || l.createdBy === user.sub);
  return [];
}

export async function filterUsersForUser(user, users) {
  if (!Array.isArray(users)) return [];
  if (!user) return [];
  if (["admin", "superadmin"].includes(user.role)) return users;
  if (user.role === "dispatcher") {
    return users.filter(u => u.id === user.sub || String(u.role || "").toLowerCase() === "driver" || String(u.role || "").toLowerCase() === "admin");
  }
  if (user.role === "driver") {
    const dispatcherIds = await getDispatcherIdsForDriver(user.sub);
    return users.filter(u => u.id === user.sub || dispatcherIds.includes(u.id));
  }
  if (user.role === "broker") {
    return users.filter(u => u.id === user.sub || String(u.role || "").toLowerCase() === "driver");
  }
  return [];
}
