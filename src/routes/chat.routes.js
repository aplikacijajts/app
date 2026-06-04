import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { readJson, updateJson } from '../services/jsonStore.js';
import { uid } from '../utils/id.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { canChatWith, conversationIdFor, getVisibleChatUsers } from '../services/chatAccess.js';

const router = express.Router();
router.use(requireAuth);

function safeMessage(m) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    text: m.text,
    createdAt: m.createdAt,
    readAt: m.readAt || null
  };
}

router.get('/contacts', async (req, res) => {
  const contacts = await getVisibleChatUsers(req.user);
  const messages = await readJson('messages.json');
  const enriched = contacts.map(c => {
    const conversationId = [req.user.sub, c.id].sort().join('__');
    const last = messages.filter(m => m.conversationId === conversationId).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
    const unread = messages.filter(m => m.conversationId === conversationId && m.toUserId === req.user.sub && !m.readAt).length;
    return { ...c, conversationId, lastMessage: last ? safeMessage(last) : null, unread };
  }).sort((a,b) => String(b.lastMessage?.createdAt || '').localeCompare(String(a.lastMessage?.createdAt || '')));
  res.json({ ok: true, contacts: enriched });
});

router.get('/messages/:userId', async (req, res) => {
  const otherId = req.params.userId;
  if (!(await canChatWith(req.user, otherId))) return res.status(403).json({ error: 'Chat access denied' });
  const conversationId = await conversationIdFor(req.user.sub, otherId);
  const limit = Math.min(Number(req.query.limit || 100), 250);
  let messages = await readJson('messages.json');
  const rows = messages.filter(m => m.conversationId === conversationId).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-limit);
  await updateJson('messages.json', arr => arr.map(m => (m.conversationId === conversationId && m.toUserId === req.user.sub && !m.readAt) ? { ...m, readAt: new Date().toISOString() } : m));
  res.json({ ok: true, conversationId, messages: rows.map(safeMessage) });
});

router.post('/messages/:userId', async (req, res) => {
  const otherId = req.params.userId;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'Message is too long' });
  if (!(await canChatWith(req.user, otherId))) return res.status(403).json({ error: 'Chat access denied' });

  const users = await readJson('users.json');
  const sender = users.find(u => u.id === req.user.sub);
  const conversationId = await conversationIdFor(req.user.sub, otherId);
  const message = {
    id: uid('msg'),
    conversationId,
    fromUserId: req.user.sub,
    toUserId: otherId,
    text,
    createdAt: new Date().toISOString(),
    readAt: null
  };
  await updateJson('messages.json', arr => (arr.push(message), arr));
  await audit('chat_message_sent', { fromUserId: req.user.sub, toUserId: otherId, conversationId });
  await notify.users([otherId], {
    type: 'chat_message',
    title: `New message from ${sender?.name || req.user.name || 'JTS'}`,
    message: text.length > 120 ? text.slice(0, 117) + '...' : text,
    data: { conversationId, fromUserId: req.user.sub, url: `/chat.html?user=${encodeURIComponent(req.user.sub)}` }
  });
  res.json({ ok: true, message: safeMessage(message) });
});

router.post('/read/:userId', async (req, res) => {
  const otherId = req.params.userId;
  if (!(await canChatWith(req.user, otherId))) return res.status(403).json({ error: 'Chat access denied' });
  const conversationId = await conversationIdFor(req.user.sub, otherId);
  await updateJson('messages.json', arr => arr.map(m => (m.conversationId === conversationId && m.toUserId === req.user.sub && !m.readAt) ? { ...m, readAt: new Date().toISOString() } : m));
  res.json({ ok: true });
});

export default router;
