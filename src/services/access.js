import { readJson } from "./jsonStore.js";

export async function getAssignedDriverIdsForDispatcher(dispatcherId) {
  const assignments = await readJson("assignments.json");
  return assignments
    .filter(a => a.dispatcherId === dispatcherId)
    .flatMap(a => Array.isArray(a.driverIds) ? a.driverIds : [])
    .filter(Boolean);
}

export async function canAccessDriver(user, driverId) {
  if (!user || !driverId) return false;
  if (user.role === "admin") return true;
  if (user.role === "driver") return user.sub === driverId;
  if (user.role === "dispatcher") {
    const ids = await getAssignedDriverIdsForDispatcher(user.sub);
    return ids.includes(driverId);
  }
  return false;
}

export async function filterLoadsForUser(user, loads) {
  if (!Array.isArray(loads)) return [];
  if (!user) return [];
  if (user.role === "admin") return loads;
  if (user.role === "driver") return loads.filter(l => l.driverId === user.sub);
  if (user.role === "dispatcher") {
    const ids = await getAssignedDriverIdsForDispatcher(user.sub);
    return loads.filter(l => ids.includes(l.driverId) || l.dispatcherId === user.sub);
  }
  if (user.role === "broker") return loads.filter(l => l.brokerId === user.sub || l.createdBy === user.sub);
  return [];
}

export async function filterUsersForUser(user, users) {
  if (!Array.isArray(users)) return [];
  if (!user) return [];
  if (user.role === "admin") return users;
  if (user.role === "dispatcher") {
    const ids = await getAssignedDriverIdsForDispatcher(user.sub);
    return users.filter(u => u.id === user.sub || ids.includes(u.id));
  }
  if (user.role === "driver" || user.role === "broker") return users.filter(u => u.id === user.sub);
  return [];
}
