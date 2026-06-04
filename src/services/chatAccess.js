import { readJson } from './jsonStore.js';
import { getDispatcherIdsForDriver } from './access.js';

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name || u.email || 'User',
    email: u.email || '',
    role: u.role || 'user',
    companyId: u.companyId || 'jts-logistics',
    status: u.status || 'approved',
    phone: u.phone || null,
    truckNumber: u.truckNumber || null,
    trailerNumber: u.trailerNumber || null,
    trailerType: u.trailerType || null
  };
}

function uniqueUsers(rows) {
  const out = [];
  const seen = new Set();
  for (const u of rows) {
    if (!u || seen.has(u.id)) continue;
    seen.add(u.id);
    out.push(publicUser(u));
  }
  return out;
}

function sortByRoleAndName(rows) {
  const order = { admin: 0, dispatcher: 1, driver: 2, broker: 3 };
  return rows.sort((a, b) => {
    const ra = order[String(a.role || '').toLowerCase()] ?? 9;
    const rb = order[String(b.role || '').toLowerCase()] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
  });
}

async function activeConversationUserIds(currentUserId) {
  const messages = await readJson('messages.json');
  const ids = new Set();
  for (const m of messages) {
    if (m.fromUserId === currentUserId && m.toUserId) ids.add(m.toUserId);
    if (m.toUserId === currentUserId && m.fromUserId) ids.add(m.fromUserId);
  }
  return ids;
}

export async function getVisibleChatUsers(currentUser) {
  const allUsers = await readJson('users.json');
  const users = allUsers.filter(u => u.status === 'approved' && u.id !== currentUser.sub);
  const role = String(currentUser.role || '').toLowerCase();

  if (role === 'admin') {
    return sortByRoleAndName(users.map(publicUser));
  }

  if (role === 'dispatcher') {
    // Dispatchers can see/message all approved drivers. Drivers will only see non-primary dispatchers after the dispatcher starts a conversation.
    const activeIds = await activeConversationUserIds(currentUser.sub);
    const allowed = users.filter(u =>
      u.role === 'admin' ||
      u.role === 'driver' ||
      activeIds.has(u.id)
    );
    return sortByRoleAndName(uniqueUsers(allowed));
  }

  if (role === 'driver') {
    const dispatcherIds = await getDispatcherIdsForDriver(currentUser.sub);
    const activeIds = await activeConversationUserIds(currentUser.sub);
    const allowed = users.filter(u => {
      if (u.role === 'dispatcher' && dispatcherIds.includes(u.id)) return true;
      // Admin or non-primary dispatcher appears automatically after they send the driver a message.
      if ((u.role === 'admin' || u.role === 'dispatcher') && activeIds.has(u.id)) return true;
      return false;
    });
    return sortByRoleAndName(uniqueUsers(allowed));
  }

  if (role === 'broker') {
    const activeIds = await activeConversationUserIds(currentUser.sub);
    const allowed = users.filter(u => u.role === 'admin' || activeIds.has(u.id));
    return sortByRoleAndName(uniqueUsers(allowed));
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
