const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') })
const express = require('express')
const cors = require('cors')
const { AccessToken } = require('livekit-server-sdk')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(express.json())

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3010,http://127.0.0.1:3010')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    return cb(new Error('CORS blocked for origin: ' + origin))
  },
  credentials: true,
}))

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const supabaseAnon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const lkApiKey = (process.env.LIVEKIT_API_KEY || '').trim()
const lkApiSecret = (process.env.LIVEKIT_API_SECRET || '').trim()

if (!supabaseUrl || !supabaseAnon || !supabaseService) {
  console.error('Missing Supabase envs')
}
if (!lkApiKey || !lkApiSecret) {
  console.error('Missing LiveKit envs')
}

const userClient = createClient(supabaseUrl || '', supabaseAnon || '')
const adminClient = createClient(supabaseUrl || '', supabaseService || '')

async function requireUser(req, res) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const meRes = await userClient.auth.getUser(token)
  const me = meRes.data.user
  if (!me) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return me
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/livekit-token', async (req, res) => {
  try {
    const { roomName, userId, username } = req.body || {}
    if (!roomName || !userId) return res.status(400).json({ error: 'roomName and userId are required' })
    if (!lkApiKey || !lkApiSecret) return res.status(500).json({ error: 'LIVEKIT env missing' })

    const token = new AccessToken(lkApiKey, lkApiSecret, {
      identity: String(userId),
      name: username || `user_${String(userId).slice(0, 6)}`,
      ttl: '2h',
    })
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
    return res.json({ token: await token.toJwt() })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'internal error' })
  }
})

app.post('/admin/create-user', async (req, res) => {
  try {
    const me = await requireUser(req, res)
    if (!me) return
    const meEmail = (me?.email || '').trim().toLowerCase()
    if (meEmail !== 'cany132rus@gmail.com') {
      return res.status(403).json({ error: 'Forbidden', details: `email=${meEmail || 'none'}` })
    }

    const login = String(req.body?.login || '').trim().toLowerCase()
    const password = String(req.body?.password || '').trim()
    if (!login || password.length < 6) return res.status(400).json({ error: 'login and password >=6 are required' })

    const email = login.includes('@') ? login : `${login}@local.app`
    const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (users.error) return res.status(500).json({ error: users.error.message })

    const existing = (users.data.users || []).find((u) => (u.email || '').toLowerCase() === email)
    let userId = ''

    if (existing) {
      userId = existing.id
      const upd = await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
      if (upd.error) return res.status(500).json({ error: upd.error.message })
    } else {
      const crt = await adminClient.auth.admin.createUser({ email, password, email_confirm: true })
      if (crt.error) return res.status(500).json({ error: crt.error.message })
      userId = crt.data.user?.id || ''
    }

    if (userId) {
      await adminClient.from('profiles').upsert({ id: userId, username: login.replace(/@.*$/, ''), status: 'offline' })
    }

    return res.json({ ok: true, email })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'internal error' })
  }
})

app.post('/join-by-invite', async (req, res) => {
  try {
    const me = await requireUser(req, res)
    if (!me) return

    const inviteCode = String(req.body?.inviteCode || '').trim()
    if (!inviteCode) return res.status(400).json({ error: 'inviteCode is required' })

    const { data: srv, error: srvErr } = await adminClient
      .from('servers')
      .select('id,name,invite_code')
      .eq('invite_code', inviteCode)
      .maybeSingle()

    if (srvErr) return res.status(500).json({ error: srvErr.message })
    if (!srv) return res.status(404).json({ error: 'Инвайт не найден' })

    const { error: memberErr } = await adminClient
      .from('server_members')
      .upsert({ server_id: srv.id, user_id: me.id, role: 'member' })

    if (memberErr) return res.status(500).json({ error: memberErr.message })

    return res.json({ ok: true, server: srv })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'internal error' })
  }
})

app.get('/my-servers', async (req, res) => {
  try {
    const me = await requireUser(req, res)
    if (!me) return

    const { data: owned, error: ownedErr } = await adminClient
      .from('servers')
      .select('id,name,invite_code,created_at')
      .eq('owner_id', me.id)
      .order('created_at')
    if (ownedErr) return res.status(500).json({ error: ownedErr.message })

    const { data: members, error: memErr } = await adminClient
      .from('server_members')
      .select('server_id')
      .eq('user_id', me.id)
    if (memErr) return res.status(500).json({ error: memErr.message })

    const ids = Array.from(new Set((members || []).map((m) => m.server_id).filter(Boolean)))
    let joined = []
    if (ids.length > 0) {
      const { data: joinedData, error: joinedErr } = await adminClient
        .from('servers')
        .select('id,name,invite_code,created_at')
        .in('id', ids)
        .order('created_at')
      if (joinedErr) return res.status(500).json({ error: joinedErr.message })
      joined = joinedData || []
    }

    const map = new Map()
    ;(owned || []).forEach((s) => map.set(s.id, s))
    ;(joined || []).forEach((s) => map.set(s.id, s))
    return res.json({ servers: Array.from(map.values()) })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'internal error' })
  }
})

const port = Number(process.env.PORT || 8787)

if (process.env.VERCEL) {
  module.exports = app
} else {
  app.listen(port, () => {
    console.log(`API server listening on :${port}`)
  })
}
