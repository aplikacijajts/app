import { readJson } from './jsonStore.js';
import { getAssignedDriverIdsForDispatcher } from './access.js';

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name || u.email || 'User',
    email: u.email || '',
    role: u.role || 'user',
    companyId: u.companyId || 'jts-logistics',
    status: u.status || 'approved',
    phone: u.phone || null
  };
}

export async function getVisibleChatUsers(currentUser) {
  const users = (await readJson('users.json')).filter(u => u.status === 'approved' && u.id !== currentUser.sub);
  const role = String(currentUser.role || '').toLowerCase();

  if (role === 'admin' || role === 'dispatcher') {
    return users.map(publicUser);
  }

  if (role === 'driver') {
    const assignments = await readJson('assignments.json');
    const dispatcherIds = assignments
      .filter(a => Array.isArray(a.driverIds) && a.driverIds.includes(currentUser.sub))
      .map(a => a.dispatcherId);
    return users.filter(u => u.role === 'dispatcher' && dispatcherIds.includes(u.id)).map(publicUser);
  }

  if (role === 'broker') {
    return users.filter(u => u.role === 'admin').map(publicUser);
  }

  return [];
}

export async function canChatWith(currentUser, otherUserId) {
  if (!currentUser || !otherUserId || currentUser.sub === otherUserId) return false;
  const visible = await getVisibleChatUsers(currentUser);
  return visible.some(u => u.id === otherUserId);
}

export async function conversationIdFor(a, b) {
  return [String(a), String(b)].sort().join('__');
}
