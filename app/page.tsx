'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Room, RoomEvent, Track } from 'livekit-client'

type Profile = { id: string; username: string | null }
type Server = { id: string; name: string; invite_code: string }
type Channel = { id: string; server_id: string; name: string; type: 'text' | 'voice' }
type Msg = { id: string; content: string; created_at: string; author_id: string }
type VoicePresence = { user_id: string; is_muted: boolean; is_deafened: boolean }
type DmMessage = { id: string; from: string; to: string; text: string; createdAt: string }

type VoiceMember = { identity: string; name: string; speaking: boolean; micEnabled: boolean }
type ServerMember = { id: string; name: string; role: string }

const randomName = () => `user_${Math.random().toString(36).slice(2, 8)}`
const serverGlyph = (name: string) => {
  const clean = name.trim()
  if (!clean) return 'SV'
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
const VOICE_SETTINGS_STORAGE_KEY = 'friends_voice_settings_v1'
const APP_STATE_STORAGE_KEY = 'friends_voice_app_state_v1'
const APP_CACHE_STORAGE_KEY = 'friends_voice_cache_v1'
const VOICE_LAYOUT_STORAGE_KEY = 'friends_voice_layout_v1'
const CHANNEL_PERMS_STORAGE_KEY = 'friends_voice_channel_perms_v1'
const CHANNEL_ORDER_STORAGE_KEY = 'friends_voice_channel_order_v1'
const CHANNEL_UI_STORAGE_KEY = 'friends_voice_channel_ui_v1'
const CHANNEL_CATEGORIES_STORAGE_KEY = 'friends_voice_channel_categories_v1'
const LAST_CHANNEL_BY_SERVER_STORAGE_KEY = 'friends_voice_last_channel_by_server_v1'
const CHANNEL_MEMBER_META_STORAGE_KEY = 'friends_voice_channel_member_meta_v1'
const FRIENDS_STORAGE_KEY = 'friends_voice_friends_v1'
const DMS_STORAGE_KEY = 'friends_voice_dms_v1'

export default function Home() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState('')
  const [authSending, setAuthSending] = useState(false)
  const [authCooldownSec, setAuthCooldownSec] = useState(0)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [servers, setServers] = useState<Server[]>([])
  const [activeServerId, setActiveServerId] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)

  const [messages, setMessages] = useState<Msg[]>([])
  const [messageInput, setMessageInput] = useState('')

  const [voiceUsers, setVoiceUsers] = useState<VoicePresence[]>([])
  const [voiceUserNames, setVoiceUserNames] = useState<Record<string, string>>({})
  const [joinedVoiceChannelId, setJoinedVoiceChannelId] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)

  const [voiceMembers, setVoiceMembers] = useState<VoiceMember[]>([])
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceConnected, setVoiceConnected] = useState(false)
  const [voiceActionBusy, setVoiceActionBusy] = useState(false)
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([])
  const [screenSharing, setScreenSharing] = useState(false)
  const [remoteVideoCount, setRemoteVideoCount] = useState(0)
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null)
  const [voiceLayout, setVoiceLayout] = useState<Array<'screen' | 'presence' | 'fine'>>(['screen', 'presence', 'fine'])
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null)
  const [pttEnabled, setPttEnabled] = useState(false)
  const [pttPressed, setPttPressed] = useState(false)
  const [channelPerms, setChannelPerms] = useState<Record<string, { role: 'owner' | 'member'; canView: boolean; canSend: boolean; canSpeak: boolean }>>({})
  const [channelMemberMetaByChannel, setChannelMemberMetaByChannel] = useState<Record<string, Record<string, { isAdmin?: boolean; nick?: string }>>>({})
  const [channelOrderByServer, setChannelOrderByServer] = useState<Record<string, string[]>>({})
  const [dragChannelId, setDragChannelId] = useState<string | null>(null)
  const [channelSearch, setChannelSearch] = useState('')
  const [channelCategoriesByServer, setChannelCategoriesByServer] = useState<Record<string, { id: string; name: string; collapsed: boolean }[]>>({})
  const [channelCategoryMapByServer, setChannelCategoryMapByServer] = useState<Record<string, Record<string, string>>>({})
  const [newCategoryName, setNewCategoryName] = useState('')
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null)
  const [dropCategoryId, setDropCategoryId] = useState<string | null>(null)
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [channelNavIndex, setChannelNavIndex] = useState(0)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState('')
  const [quickSwitcherIndex, setQuickSwitcherIndex] = useState(0)
  const [lastChannelByServer, setLastChannelByServer] = useState<Record<string, string>>({})
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioInputId, setSelectedAudioInputId] = useState('')
  const [micGain, setMicGain] = useState(100)
  const [masterVolume, setMasterVolume] = useState(100)
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({})
  const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({})
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true)
  const liveRoomRef = useRef<Room | null>(null)
  const remoteAudioElsRef = useRef<HTMLMediaElement[]>([])
  const remoteAudioByIdentityRef = useRef<Record<string, HTMLMediaElement[]>>({})
  const remoteAudioCtxRef = useRef<AudioContext | null>(null)
  const remoteMasterGainRef = useRef<GainNode | null>(null)
  const remoteUserGainsRef = useRef<Record<string, GainNode>>({})
  const remoteSourceNodesRef = useRef<Map<HTMLMediaElement, MediaElementAudioSourceNode>>(new Map())
  const localMicTrackRef = useRef<MediaStreamTrack | null>(null)
  const localRawStreamRef = useRef<MediaStream | null>(null)
  const localAudioCtxRef = useRef<AudioContext | null>(null)
  const joiningVoiceRef = useRef(false)
  const videoStageRef = useRef<HTMLDivElement | null>(null)
  const remoteVideoElsRef = useRef<HTMLMediaElement[]>([])
  const remoteVideoWrapRef = useRef<Map<HTMLMediaElement, HTMLDivElement>>(new Map())
  const hydratingUidRef = useRef<string | null>(null)
  const lastHydratedUidRef = useRef<string | null>(null)

  const [newServerName, setNewServerName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [serverCreateOpen, setServerCreateOpen] = useState(false)
  const [serverSearchOpen, setServerSearchOpen] = useState(false)
  const [serverSearchQuery, setServerSearchQuery] = useState('')
  const [inviteJoinOpen, setInviteJoinOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [friendSearch, setFriendSearch] = useState('')
  const [friendResults, setFriendResults] = useState<Profile[]>([])
  const [friendsByUser, setFriendsByUser] = useState<Record<string, string[]>>({})
  const [dmsByPair, setDmsByPair] = useState<Record<string, DmMessage[]>>({})
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null)
  const [dmInput, setDmInput] = useState('')
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileNameDraft, setProfileNameDraft] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text')

  const [adminNewLogin, setAdminNewLogin] = useState('')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const isAdmin = sessionEmail === 'cany132rus@gmail.com'

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  )

  const sortedVoiceMembers = useMemo(() => {
    const list = [...voiceMembers]
    if (!pinnedIdentity) return list
    return list.sort((a, b) => (a.identity === pinnedIdentity ? -1 : b.identity === pinnedIdentity ? 1 : 0))
  }, [voiceMembers, pinnedIdentity])

  const visibleChannels = useMemo(() => {
    const filtered = channels.filter((c) => (channelPerms[c.id]?.canView ?? true))
    if (!activeServerId) return filtered
    const order = channelOrderByServer[activeServerId] || []
    if (!order.length) return filtered
    const rank = new Map(order.map((id, idx) => [id, idx]))
    return [...filtered].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999))
  }, [channels, channelPerms, activeServerId, channelOrderByServer])

  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase()
    if (!q) return visibleChannels
    return visibleChannels.filter((c) => c.name.toLowerCase().includes(q))
  }, [visibleChannels, channelSearch])

  const categorizedChannelGroups = useMemo(() => {
    if (!activeServerId) return [] as { id: string; name: string; collapsed: boolean; channels: Channel[] }[]
    const categories = channelCategoriesByServer[activeServerId] || [
      { id: 'text', name: 'ТЕКСТОВЫЕ', collapsed: false },
      { id: 'voice', name: 'ГОЛОСОВЫЕ', collapsed: false },
    ]
    const map = channelCategoryMapByServer[activeServerId] || {}
    return categories.map((cat) => ({
      ...cat,
      channels: filteredChannels.filter((c) => (map[c.id] || c.type) === cat.id),
    }))
  }, [activeServerId, filteredChannels, channelCategoriesByServer, channelCategoryMapByServer])

  const navigableChannelIds = useMemo(() => categorizedChannelGroups.flatMap((g) => (g.collapsed ? [] : g.channels.map((c) => c.id))), [categorizedChannelGroups])

  const quickSwitcherChannels = useMemo(() => {
    const q = quickSwitcherQuery.trim().toLowerCase()
    const base = categorizedChannelGroups.flatMap((g) => g.channels)
    if (!q) return base.slice(0, 12)
    return base.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12)
  }, [categorizedChannelGroups, quickSwitcherQuery])

  const serverSearchResults = useMemo(() => {
    const q = serverSearchQuery.trim().toLowerCase()
    if (!q) return servers.slice(0, 20)
    return servers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 20)
  }, [servers, serverSearchQuery])

  const voiceUserSet = useMemo(() => new Set(voiceUsers.map((u) => u.user_id)), [voiceUsers])

  const serverRoleById = useMemo(() => {
    const map: Record<string, string> = {}
    serverMembers.forEach((m) => { map[m.id] = m.role || 'member' })
    return map
  }, [serverMembers])

  const isServerOwner = serverRoleById[sessionUserId || ''] === 'owner'
  const channelMetaForActive = useMemo(() => {
    if (!activeChannelId) return {} as Record<string, { isAdmin?: boolean; nick?: string }>
    return channelMemberMetaByChannel[activeChannelId] || {}
  }, [channelMemberMetaByChannel, activeChannelId])

  const displayNameInChannel = (userId: string, fallback: string) => {
    const nick = channelMetaForActive[userId]?.nick?.trim()
    return nick || fallback
  }

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {}
    serverMembers.forEach((m) => { map[m.id] = m.name })
    return map
  }, [serverMembers])

  const getUserDisplayName = (uid: string) => memberNameById[uid] || uid.slice(0, 8)

  const saveProfileName = async () => {
    if (!sessionUserId) return
    const name = profileNameDraft.trim()
    if (!name) return
    const { error } = await supabase.from('profiles').upsert({ id: sessionUserId, username: name }, { onConflict: 'id' })
    if (error) return alert(error.message)
    setProfile((prev) => ({ id: sessionUserId, username: name || prev?.username || sessionUserId.slice(0, 8) }))
    setProfileEditorOpen(false)
    if (activeServerId) await loadServerMembers(activeServerId)
  }

  const myFriendIds = useMemo(() => {
    if (!sessionUserId) return [] as string[]
    return friendsByUser[sessionUserId] || []
  }, [friendsByUser, sessionUserId])

  const friendProfiles = useMemo(() => {
    const map = new Map(serverMembers.map((m) => [m.id, m.name]))
    return myFriendIds.map((id) => ({ id, username: map.get(id) || id.slice(0, 8) }))
  }, [myFriendIds, serverMembers])

  const dmPairKey = (a: string, b: string) => [a, b].sort().join('__')
  const activeDmKey = sessionUserId && activeDmUserId ? dmPairKey(sessionUserId, activeDmUserId) : ''
  const activeDmMessages = useMemo(() => (activeDmKey ? (dmsByPair[activeDmKey] || []) : []), [dmsByPair, activeDmKey])

  const lkUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || ''
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)

      if (typeof saved?.selectedAudioInputId === 'string') setSelectedAudioInputId(saved.selectedAudioInputId)
      if (typeof saved?.micGain === 'number' && Number.isFinite(saved.micGain)) {
        setMicGain(Math.max(0, Math.min(300, Math.round(saved.micGain))))
      }
      if (typeof saved?.masterVolume === 'number' && Number.isFinite(saved.masterVolume)) {
        setMasterVolume(Math.max(0, Math.min(400, Math.round(saved.masterVolume))))
      }
      if (typeof saved?.noiseSuppressionEnabled === 'boolean') setNoiseSuppressionEnabled(saved.noiseSuppressionEnabled)
      if (saved?.userVolumes && typeof saved.userVolumes === 'object') {
        const cleaned: Record<string, number> = {}
        Object.entries(saved.userVolumes as Record<string, unknown>).forEach(([k, v]) => {
          if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v)) {
            cleaned[k] = Math.max(0, Math.min(400, Math.round(v)))
          }
        })
        setUserVolumes(cleaned)
      }
      if (saved?.mutedUsers && typeof saved.mutedUsers === 'object') {
        const cleanedMuted: Record<string, boolean> = {}
        Object.entries(saved.mutedUsers as Record<string, unknown>).forEach(([k, v]) => {
          if (typeof k === 'string' && typeof v === 'boolean') cleanedMuted[k] = v
        })
        setMutedUsers(cleanedMuted)
      }
    } catch {
      // ignore malformed settings
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        VOICE_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          selectedAudioInputId,
          micGain,
          masterVolume,
          userVolumes,
          mutedUsers,
          noiseSuppressionEnabled,
        })
      )
    } catch {
      // ignore storage failures
    }
  }, [selectedAudioInputId, micGain, masterVolume, userVolumes, mutedUsers, noiseSuppressionEnabled])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (typeof saved?.activeServerId === 'string') setActiveServerId(saved.activeServerId)
        if (typeof saved?.activeChannelId === 'string') setActiveChannelId(saved.activeChannelId)
      }

      const cacheRaw = window.localStorage.getItem(APP_CACHE_STORAGE_KEY)
      if (cacheRaw) {
        const cache = JSON.parse(cacheRaw)
        if (Array.isArray(cache?.servers)) setServers(cache.servers as Server[])
        if (Array.isArray(cache?.channels)) setChannels(cache.channels as Channel[])
        if (cache?.profile && typeof cache.profile === 'object') setProfile(cache.profile as Profile)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        APP_STATE_STORAGE_KEY,
        JSON.stringify({ activeServerId, activeChannelId })
      )
    } catch {}
  }, [activeServerId, activeChannelId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        APP_CACHE_STORAGE_KEY,
        JSON.stringify({ servers, channels, profile })
      )
    } catch {}
  }, [servers, channels, profile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(VOICE_LAYOUT_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (Array.isArray(saved) && saved.length === 3) {
        const ok = saved.every((x) => x === 'screen' || x === 'presence' || x === 'fine')
        if (ok) setVoiceLayout(saved)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(VOICE_LAYOUT_STORAGE_KEY, JSON.stringify(voiceLayout))
    } catch {}
  }, [voiceLayout])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(CHANNEL_PERMS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setChannelPerms(parsed)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHANNEL_PERMS_STORAGE_KEY, JSON.stringify(channelPerms))
    } catch {}
  }, [channelPerms])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(CHANNEL_MEMBER_META_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setChannelMemberMetaByChannel(parsed)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHANNEL_MEMBER_META_STORAGE_KEY, JSON.stringify(channelMemberMetaByChannel))
    } catch {}
  }, [channelMemberMetaByChannel])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(CHANNEL_ORDER_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setChannelOrderByServer(parsed)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHANNEL_ORDER_STORAGE_KEY, JSON.stringify(channelOrderByServer))
    } catch {}
  }, [channelOrderByServer])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(CHANNEL_CATEGORIES_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.categoriesByServer && typeof parsed.categoriesByServer === 'object') setChannelCategoriesByServer(parsed.categoriesByServer)
      if (parsed?.categoryMapByServer && typeof parsed.categoryMapByServer === 'object') setChannelCategoryMapByServer(parsed.categoryMapByServer)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHANNEL_CATEGORIES_STORAGE_KEY, JSON.stringify({
        categoriesByServer: channelCategoriesByServer,
        categoryMapByServer: channelCategoryMapByServer,
      }))
    } catch {}
  }, [channelCategoriesByServer, channelCategoryMapByServer])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(LAST_CHANNEL_BY_SERVER_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setLastChannelByServer(parsed)
    } catch {}
  }, [])

  useEffect(() => {
    if (!activeServerId || !activeChannelId) return
    setLastChannelByServer((prev) => {
      if (prev[activeServerId] === activeChannelId) return prev
      return { ...prev, [activeServerId]: activeChannelId }
    })
  }, [activeServerId, activeChannelId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(LAST_CHANNEL_BY_SERVER_STORAGE_KEY, JSON.stringify(lastChannelByServer))
    } catch {}
  }, [lastChannelByServer])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawFriends = window.localStorage.getItem(FRIENDS_STORAGE_KEY)
      if (rawFriends) {
        const parsed = JSON.parse(rawFriends)
        if (parsed && typeof parsed === 'object') setFriendsByUser(parsed)
      }
      const rawDms = window.localStorage.getItem(DMS_STORAGE_KEY)
      if (rawDms) {
        const parsed = JSON.parse(rawDms)
        if (parsed && typeof parsed === 'object') setDmsByPair(parsed)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify(friendsByUser)) } catch {}
  }, [friendsByUser])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(DMS_STORAGE_KEY, JSON.stringify(dmsByPair)) } catch {}
  }, [dmsByPair])

  useEffect(() => {
    if (!activeServerId) return
    setChannelCategoriesByServer((prev) => {
      if (prev[activeServerId]?.length) return prev
      return {
        ...prev,
        [activeServerId]: [
          { id: 'text', name: 'ТЕКСТОВЫЕ', collapsed: false },
          { id: 'voice', name: 'ГОЛОСОВЫЕ', collapsed: false },
        ],
      }
    })
  }, [activeServerId])

  useEffect(() => {
    setOpenMemberMenuId(null)
    setOpenCategoryMenuId(null)
    setEditingCategoryId(null)
    setEditingCategoryName('')
    setQuickSwitcherOpen(false)
    setQuickSwitcherQuery('')
    setDropCategoryId(null)
    setDragCategoryId(null)
    setDragChannelId(null)
  }, [activeServerId])

  useEffect(() => {
    const onQuickSwitcherHotkey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!sessionUserId) return
        setQuickSwitcherOpen(true)
        setQuickSwitcherQuery('')
        setQuickSwitcherIndex(0)
      }
      if (e.key === 'Escape') {
        setQuickSwitcherOpen(false)
      }
    }
    window.addEventListener('keydown', onQuickSwitcherHotkey)
    return () => window.removeEventListener('keydown', onQuickSwitcherHotkey)
  }, [])

  useEffect(() => {
    if (!quickSwitcherOpen) return
    const onQuickSwitcherNav = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setQuickSwitcherIndex((prev) => Math.min(Math.max(quickSwitcherChannels.length - 1, 0), prev + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setQuickSwitcherIndex((prev) => Math.max(0, prev - 1))
      }
      if (e.key === 'Enter') {
        const c = quickSwitcherChannels[quickSwitcherIndex]
        if (c?.id) {
          setActiveChannelId(c.id)
          setQuickSwitcherOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onQuickSwitcherNav)
    return () => window.removeEventListener('keydown', onQuickSwitcherNav)
  }, [quickSwitcherOpen, quickSwitcherChannels, quickSwitcherIndex])

  useEffect(() => {
    const onChannelNav = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '')) return
      if (!navigableChannelIds.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setChannelNavIndex((prev) => Math.min(navigableChannelIds.length - 1, prev + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setChannelNavIndex((prev) => Math.max(0, prev - 1))
      }
      if (e.key === 'Enter') {
        const id = navigableChannelIds[channelNavIndex]
        if (id) setActiveChannelId(id)
      }
    }

    window.addEventListener('keydown', onChannelNav)
    return () => window.removeEventListener('keydown', onChannelNav)
  }, [navigableChannelIds, channelNavIndex])

  useEffect(() => {
    if (!navigableChannelIds.length) return
    const idx = activeChannelId ? navigableChannelIds.indexOf(activeChannelId) : -1
    if (idx >= 0) setChannelNavIndex(idx)
  }, [activeChannelId, navigableChannelIds])

  useEffect(() => {
    if (!pttEnabled || !voiceConnected) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      setPttPressed(true)
      if (localMicTrackRef.current) localMicTrackRef.current.enabled = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      setPttPressed(false)
      if (localMicTrackRef.current) localMicTrackRef.current.enabled = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [pttEnabled, voiceConnected])

  useEffect(() => {
    setOpenCategoryMenuId(null)
    setOpenMemberMenuId(null)
    setEditingCategoryId(null)
  }, [activeServerId])

  useEffect(() => {
    if (!voiceConnected) return

    const onHotkeys = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.code === 'KeyM') {
        e.preventDefault()
        void updateVoiceFlags(!muted, deafened)
      }
      if (e.code === 'KeyD') {
        e.preventDefault()
        void updateVoiceFlags(muted, !deafened)
      }
    }

    window.addEventListener('keydown', onHotkeys)
    return () => window.removeEventListener('keydown', onHotkeys)
  }, [voiceConnected, muted, deafened])

  const getOutputGainForIdentity = (identity: string) => {
    if (mutedUsers[identity]) return 0
    const perUser = userVolumes[identity] ?? 100
    // GainNode allows >1 amplification, unlike HTMLMediaElement.volume.
    return Math.max(0, Math.min(4, (masterVolume / 100) * (perUser / 100)))
  }

  const refreshAudioElementVolumes = () => {
    const byIdentity = remoteAudioByIdentityRef.current
    const userGains = remoteUserGainsRef.current
    Object.entries(byIdentity).forEach(([identity, els]) => {
      const gain = getOutputGainForIdentity(identity)
      if (userGains[identity]) {
        userGains[identity].gain.value = gain
      }
      els.forEach((el) => {
        // keep element volume in valid range; loudness is controlled by GainNode
        el.volume = 1
      })
    })
  }

  const refreshVoiceMembers = () => {
    const room = liveRoomRef.current
    if (!room) return setVoiceMembers([])

    const list: VoiceMember[] = []
    room.remoteParticipants.forEach((p) => {
      const micPub = Array.from(p.audioTrackPublications.values())[0]
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        speaking: p.isSpeaking,
        micEnabled: !!micPub?.isSubscribed,
      })
    })

    const local = room.localParticipant
    list.unshift({
      identity: local.identity,
      name: local.name || local.identity,
      speaking: local.isSpeaking,
      micEnabled: !muted,
    })

    setVoiceMembers(list)
  }

  const hydrateAfterAuth = async (uid: string) => {
    if (!uid) return
    if (hydratingUidRef.current === uid) return
    if (lastHydratedUidRef.current === uid) return
    hydratingUidRef.current = uid
    try {
      await Promise.all([ensureProfile(uid), loadServers(uid)])
      lastHydratedUidRef.current = uid
    } finally {
      hydratingUidRef.current = null
    }
  }

  const loadInitial = async () => {
    let uid: string | null = null
    let email: string | null = null

    try {
      const initial = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth timeout')), 6000)),
      ])
      uid = initial.data.session?.user?.id || null
      email = initial.data.session?.user?.email || null
    } catch {
      uid = null
      email = null
    }

    if (!uid) {
      try {
        // attempt token refresh path on hard reload
        await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('user timeout')), 4000)),
        ])
        const { data: afterUser } = await supabase.auth.getSession()
        uid = afterUser.session?.user?.id || null
        email = afterUser.session?.user?.email || null
      } catch {}
    }

    setSessionUserId(uid)
    setSessionEmail(email)
    setAuthReady(true)
    if (!uid) return
    await hydrateAfterAuth(uid)
  }

  const ensureProfile = async (uid: string) => {
    try {
      const { data } = await supabase.from('profiles').select('id,username').eq('id', uid).maybeSingle()
      if (!data) {
        await supabase.from('profiles').insert({ id: uid, username: randomName(), status: 'online' })
        const { data: p2 } = await supabase.from('profiles').select('id,username').eq('id', uid).maybeSingle()
        setProfile((p2 as Profile) || { id: uid, username: uid.slice(0, 8) })
        return
      }
      setProfile(data as Profile)
    } catch {
      setProfile({ id: uid, username: uid.slice(0, 8) })
    }
  }

  const loadServers = async (uid: string) => {
    try {
      // Fast path: backend aggregate API (with timeout) to reduce login latency
      if (apiBaseUrl) {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData.session?.access_token
          if (token) {
            const res = await Promise.race([
              fetch(`${apiBaseUrl}/my-servers`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
              new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('api timeout')), 1800)),
            ])

            let json: any = null
            try {
              json = await (res as Response).json()
            } catch {
              json = null
            }

            if ((res as Response).ok && Array.isArray(json?.servers)) {
              const list = (json.servers as Server[]) || []
              setServers(list)
              const first = list[0]
              if (first) {
                setActiveServerId((prev) => (prev && list.some((s) => s.id === prev) ? prev : first.id))
              } else {
                setActiveServerId(null)
              }
              return
            }
          }
        } catch {
          // continue to direct supabase fallback
        }
      }

      // Fallback path: load owned and joined servers directly from Supabase
      const [membershipRes, ownedRes] = await Promise.all([
        supabase.from('server_members').select('server_id').eq('user_id', uid),
        supabase.from('servers').select('id,name,invite_code').eq('owner_id', uid).order('created_at'),
      ])

      const membershipRows = membershipRes.data || []
      const memberIds = Array.from(new Set((membershipRows || []).map((r: any) => r.server_id).filter(Boolean)))

      let joinedServers: Server[] = []
      if (memberIds.length) {
        const { data } = await supabase
          .from('servers')
          .select('id,name,invite_code')
          .in('id', memberIds)
          .order('created_at')
        joinedServers = (data as Server[]) || []
      }

      const dedup = new Map<string, Server>()
      ;((ownedRes.data as Server[]) || []).forEach((srv) => dedup.set(srv.id, srv))
      ;(joinedServers || []).forEach((srv) => dedup.set(srv.id, srv))
      const list = Array.from(dedup.values())
      setServers(list)
      const first = list[0]
      if (first) {
        setActiveServerId((prev) => (prev && list.some((srv) => srv.id === prev) ? prev : first.id))
      } else {
        setActiveServerId(null)
      }
    } catch (e: any) {
      setAuthInfo(`Ошибка загрузки серверов: ${e?.message || 'неизвестно'}`)
    }
  }


  const loadServerMembers = async (serverId: string) => {
    try {
      const { data: memberRows } = await supabase
        .from('server_members')
        .select('user_id,role')
        .eq('server_id', serverId)

      const ids = Array.from(new Set((memberRows || []).map((r: any) => r.user_id).filter(Boolean)))
      if (!ids.length) {
        setServerMembers([])
        return
      }

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', ids)

      const byId: Record<string, string> = {}
      ;(profilesData || []).forEach((p: any) => {
        if (p?.id) byId[p.id] = p?.username || String(p.id).slice(0, 8)
      })

      const roleById: Record<string, string> = {}
      ;(memberRows || []).forEach((r: any) => {
        if (r?.user_id) roleById[r.user_id] = r?.role || 'member'
      })

      setServerMembers(ids.map((id) => ({ id, name: byId[id] || id.slice(0, 8), role: roleById[id] || 'member' })))
    } catch {
      setServerMembers([])
    }
  }

  const loadChannels = async (serverId: string) => {
    const { data } = await supabase
      .from('channels')
      .select('id,server_id,name,type')
      .eq('server_id', serverId)
      .order('position')
      .order('created_at')

    const list = (data as Channel[]) || []
    setChannels(list)
    const firstText = list.find((c) => c.type === 'text') || list[0]
    const remembered = lastChannelByServer[serverId]
    const rememberedId = remembered && list.some((c) => c.id === remembered) ? remembered : null
    if (firstText) {
      setActiveChannelId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev
        return rememberedId || firstText.id
      })
    }
  }

  const loadMessages = async (channelId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id,content,created_at,author_id')
      .eq('channel_id', channelId)
      .order('created_at')
      .limit(300)
    setMessages((data as Msg[]) || [])
  }

  const loadVoicePresence = async (channelId: string) => {
    const { data } = await supabase.from('voice_presence').select('user_id,is_muted,is_deafened').eq('channel_id', channelId)
    const list = (data as VoicePresence[]) || []
    setVoiceUsers(list)

    const uniqueIds = Array.from(new Set(list.map((x) => x.user_id).filter(Boolean)))
    if (!uniqueIds.length) {
      setVoiceUserNames({})
      return
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id,username')
      .in('id', uniqueIds)

    const names: Record<string, string> = {}
    ;(profilesData || []).forEach((p: any) => {
      const display = p?.username || (typeof p?.id === 'string' ? p.id.slice(0, 8) : 'user')
      if (p?.id) names[p.id] = display
    })
    setVoiceUserNames(names)
  }

  useEffect(() => {
    loadInitial()

    const { data: authSub } = supabase.auth.onAuthStateChange(async (_ev, session) => {
      const uid = session?.user?.id || null
      setSessionUserId(uid)
      setSessionEmail(session?.user?.email || null)
      setAuthReady(true)
      if (!uid) {
        hydratingUidRef.current = null
        lastHydratedUidRef.current = null
        setProfile(null)
        setServers([])
        setChannels([])
        setMessages([])
        return
      }
      await hydrateAfterAuth(uid)
    })

    return () => authSub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!activeServerId) return
    loadChannels(activeServerId)
    loadServerMembers(activeServerId)
  }, [activeServerId])

  useEffect(() => {
    if (!activeChannelId || activeChannel?.type !== 'text') return
    loadMessages(activeChannelId)

    const ch = supabase
      .channel(`messages:${activeChannelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannelId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Msg])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [activeChannelId, activeChannel?.type])

  useEffect(() => {
    if (!activeChannelId || activeChannel?.type !== 'voice') return
    loadVoicePresence(activeChannelId)

    const ch = supabase
      .channel(`voice:${activeChannelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_presence', filter: `channel_id=eq.${activeChannelId}` }, async () => {
        await loadVoicePresence(activeChannelId)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [activeChannelId, activeChannel?.type])

  useEffect(() => {
    const loadAudioInputs = async () => {
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const inputs = devices.filter((d) => d.kind === 'audioinput')
        setAudioInputs(inputs)
        if (!selectedAudioInputId && inputs[0]?.deviceId) {
          setSelectedAudioInputId(inputs[0].deviceId)
        }
      } catch {
        // ignore
      }
    }

    loadAudioInputs()
    navigator?.mediaDevices?.addEventListener?.('devicechange', loadAudioInputs)
    return () => navigator?.mediaDevices?.removeEventListener?.('devicechange', loadAudioInputs)
  }, [selectedAudioInputId])

  useEffect(() => {
    if (authCooldownSec <= 0) return
    const t = setInterval(() => setAuthCooldownSec((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [authCooldownSec])

  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        liveRoomRef.current?.disconnect()
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', onBeforeUnload)
      return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  useEffect(() => {
    refreshAudioElementVolumes()
  }, [masterVolume, userVolumes, mutedUsers])

  const authWithPassword = async () => {
    if (!login.trim() || !password.trim() || authSending || authCooldownSec > 0) return

    setAuthSending(true)
    setAuthInfo('')

    const loginValue = login.trim().toLowerCase()
    const normalizedEmail = loginValue.includes('@')
      ? loginValue
      : (loginValue === 'admin' ? 'cany132rus@gmail.com' : `${loginValue}@local.app`)

    try {
      if (authMode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (error) throw error
        setSessionEmail(data.user?.email || normalizedEmail)
        setAuthInfo('Вход выполнен успешно')
      } else {
        const redirect = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : undefined)
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: redirect },
        })
        if (error) throw error
        setAuthInfo(`Аккаунт создан: ${normalizedEmail}`)
        setAuthMode('signin')
      }
      setAuthCooldownSec(5)
    } catch (e: any) {
      const msg = String(e?.message || '')
      setAuthInfo(`Ошибка авторизации: ${msg}`)
      setAuthCooldownSec(3)
    } finally {
      setAuthSending(false)
    }
  }

  const logout = async () => {
    if (loggingOut) return
    setLoggingOut(true)

    const cleanupLocal = () => {
      if (typeof window !== 'undefined') {
        try {
          const keysToRemove: string[] = []
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i)
            if (!k) continue
            if (k.startsWith('sb-') || k === VOICE_SETTINGS_STORAGE_KEY || k === APP_STATE_STORAGE_KEY || k === APP_CACHE_STORAGE_KEY || k === VOICE_LAYOUT_STORAGE_KEY || k === CHANNEL_PERMS_STORAGE_KEY || k === CHANNEL_ORDER_STORAGE_KEY || k === CHANNEL_UI_STORAGE_KEY || k === CHANNEL_CATEGORIES_STORAGE_KEY || k === LAST_CHANNEL_BY_SERVER_STORAGE_KEY || k === CHANNEL_MEMBER_META_STORAGE_KEY || k === FRIENDS_STORAGE_KEY || k === DMS_STORAGE_KEY) {
              keysToRemove.push(k)
            }
          }
          keysToRemove.forEach((k) => window.localStorage.removeItem(k))
        } catch {}
      }

      setSessionUserId(null)
      setSessionEmail(null)
      setProfile(null)
      setServers([])
      setChannels([])
      setMessages([])
    }

    cleanupLocal()

    const uid = sessionUserId
    Promise.race([
      leaveVoice(),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]).catch(() => {})

    Promise.race([
      supabase.auth.signOut({ scope: 'global' }),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]).catch(() => {})

    if (uid) {
      Promise.race([
        supabase.from('voice_presence').delete().eq('user_id', uid),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]).catch(() => {})
      Promise.race([
        supabase.from('profiles').update({ status: 'offline' }).eq('id', uid),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]).catch(() => {})
    }

    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  const createServer = async () => {
    if (!sessionUserId || !newServerName.trim()) return
    const { data: srv, error } = await supabase
      .from('servers')
      .insert({ name: newServerName.trim(), owner_id: sessionUserId })
      .select('id,name,invite_code')
      .single()

    if (error || !srv) return alert(error?.message || 'Ошибка создания сервера')

    const { error: memberErr } = await supabase
      .from('server_members')
      .upsert({ server_id: srv.id, user_id: sessionUserId, role: 'owner' })
    if (memberErr) return alert(`Ошибка добавления владельца в участники: ${memberErr.message}`)

    const { data: insertedChannels, error: channelErr } = await supabase.from('channels').insert([
      { server_id: srv.id, name: 'правила', type: 'text', position: 1 },
      { server_id: srv.id, name: 'общение', type: 'text', position: 2 },
      { server_id: srv.id, name: 'медиа', type: 'text', position: 3 },
      { server_id: srv.id, name: 'Голосовой', type: 'voice', position: 4 },
      { server_id: srv.id, name: 'Игровой', type: 'voice', position: 5 },
    ]).select('id,type')
    if (channelErr) return alert(`Ошибка создания каналов: ${channelErr.message}`)

    setChannelCategoriesByServer((prev) => ({
      ...prev,
      [srv.id]: [
        { id: 'info', name: 'ИНФОРМАЦИЯ', collapsed: false },
        { id: 'text', name: 'ТЕКСТОВЫЕ КАНАЛЫ', collapsed: false },
        { id: 'voice', name: 'ГОЛОСОВЫЕ КАНАЛЫ', collapsed: false },
      ],
    }))
    setChannelCategoryMapByServer((prev) => {
      const next = { ...(prev[srv.id] || {}) }
      ;(insertedChannels || []).forEach((c: any) => {
        if (c?.type === 'voice') next[c.id] = 'voice'
        else next[c.id] = Object.keys(next).length ? 'text' : 'info'
      })
      return { ...prev, [srv.id]: next }
    })

    setNewServerName('')
    setServerCreateOpen(false)
    await loadServers(sessionUserId)
    setActiveServerId(srv.id)
  }

  const joinByInvite = async () => {
    if (!sessionUserId || !inviteCode.trim()) return

    try {
      if (apiBaseUrl) {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return alert('Нет активной сессии')

        const res = await fetch(`${apiBaseUrl}/join-by-invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ inviteCode: inviteCode.trim() }),
        })

        const json = await res.json()
        if (!res.ok) return alert(json?.error || 'Ошибка вступления по инвайту')

        const srv = json?.server as Server
        setInviteCode('')
        await loadServers(sessionUserId)
        if (srv?.id) setActiveServerId(srv.id)
        setInviteJoinOpen(false)
        setServerSearchOpen(false)
        return
      }

      const { data: srv } = await supabase
        .from('servers')
        .select('id,name,invite_code')
        .eq('invite_code', inviteCode.trim())
        .maybeSingle()

      if (!srv) return alert('Инвайт не найден')

      const { error } = await supabase
        .from('server_members')
        .upsert({ server_id: srv.id, user_id: sessionUserId, role: 'member' })

      if (error) return alert(error.message)

      setInviteCode('')
      await loadServers(sessionUserId)
      setActiveServerId(srv.id)
      setInviteJoinOpen(false)
      setServerSearchOpen(false)
    } catch (e: any) {
      alert(e?.message || 'Ошибка вступления по инвайту')
    }
  }

  const createChannel = async () => {
    if (!activeServerId || !newChannelName.trim()) return
    const { error } = await supabase.from('channels').insert({
      server_id: activeServerId,
      name: newChannelName.trim(),
      type: newChannelType,
      position: channels.length + 1,
    })
    if (error) return alert(error.message)
    setNewChannelName('')
    await loadChannels(activeServerId)
  }

  const adminCreateUser = async () => {
    if (!isAdmin) return
    if (!apiBaseUrl) return alert('Не задан NEXT_PUBLIC_API_BASE_URL')
    if (!adminNewLogin.trim() || !adminNewPassword.trim()) return alert('Заполни логин и пароль')
    if (adminBusy) return

    try {
      setAdminBusy(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        alert('Нет активной сессии администратора')
        return
      }

      const res = await fetch(`${apiBaseUrl}/admin/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ login: adminNewLogin.trim(), password: adminNewPassword }),
      })

      const json = await res.json()
      if (!res.ok) {
        alert(`Ошибка создания пользователя: ${json?.error || 'неизвестно'}`)
        return
      }

      alert(`Пользователь создан/обновлен: ${json.email}`)
      setAdminNewLogin('')
      setAdminNewPassword('')
    } catch (e: any) {
      alert(`Сеть/API ошибка: ${e?.message || 'неизвестно'}`)
    } finally {
      setAdminBusy(false)
    }
  }

  const sendMessage = async () => {
    if (!sessionUserId || !activeChannelId || !messageInput.trim()) return
    if (channelPerms[activeChannelId] && !channelPerms[activeChannelId].canSend) {
      alert('Нет права canSend для этого канала (локальная настройка)')
      return
    }
    const { error } = await supabase.from('messages').insert({
      channel_id: activeChannelId,
      author_id: sessionUserId,
      content: messageInput.trim(),
    })
    if (error) return alert(error.message)
    setMessageInput('')
  }

  const joinVoice = async () => {
    if (joiningVoiceRef.current || voiceActionBusy) return
    if (!sessionUserId || !activeChannelId || !lkUrl || !apiBaseUrl) {
      setVoiceStatus('Нет NEXT_PUBLIC_LIVEKIT_URL или NEXT_PUBLIC_API_BASE_URL в .env.local')
      return
    }
    if (channelPerms[activeChannelId] && !channelPerms[activeChannelId].canSpeak) {
      setVoiceStatus('Нет права canSpeak для этого канала (локальная настройка)')
      return
    }
    if (channelPerms[activeChannelId] && !channelPerms[activeChannelId].canView) {
      setVoiceStatus('Нет права canView для этого канала (локальная настройка)')
      return
    }
    joiningVoiceRef.current = true
    setVoiceActionBusy(true)

    try {
      if (liveRoomRef.current) {
        await leaveVoice()
      }

      setVoiceStatus('Подключение к голосу...')

      const roomName = `channel_${activeChannelId}`
      const tokenRes = await fetch(`${apiBaseUrl}/livekit-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, userId: sessionUserId, username: profile?.username || undefined }),
      })

      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || !tokenData.token) {
        throw new Error(tokenData?.error || 'Не удалось получить LiveKit token')
      }

      const room = new Room({ adaptiveStream: true, dynacast: true })
      liveRoomRef.current = room

      room.on(RoomEvent.Connected, () => {
        setVoiceConnected(true)
        setVoiceStatus('Подключено')
        refreshVoiceMembers()
      })
      room.on(RoomEvent.Disconnected, () => {
        setVoiceConnected(false)
        setVoiceStatus('Отключено')
        setVoiceMembers([])
      })
      room.on(RoomEvent.ParticipantConnected, refreshVoiceMembers)
      room.on(RoomEvent.ParticipantDisconnected, refreshVoiceMembers)
      room.on(RoomEvent.ActiveSpeakersChanged, refreshVoiceMembers)
      room.on(RoomEvent.LocalTrackPublished, refreshVoiceMembers)
      room.on(RoomEvent.LocalTrackUnpublished, refreshVoiceMembers)
      room.on(RoomEvent.TrackMuted, refreshVoiceMembers)
      room.on(RoomEvent.TrackUnmuted, refreshVoiceMembers)
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        const identity = participant.identity

        if (track.kind === 'video') {
          const el = track.attach() as HTMLVideoElement
          el.autoplay = true
          el.playsInline = true
          el.className = 'w-full h-full object-cover rounded-lg bg-black'

          const wrap = document.createElement('div')
          wrap.className = 'relative w-80 h-44 rounded-lg border border-[#1e1f22] overflow-hidden shadow-lg bg-black'

          const bar = document.createElement('div')
          bar.className = 'absolute top-2 right-2 z-10 flex gap-1'

          const fullBtn = document.createElement('button')
          fullBtn.className = 'px-2 py-1 rounded bg-[#5865f2] text-white text-xs'
          fullBtn.textContent = 'FullHD'
          fullBtn.onclick = async () => {
            try { if (el.requestFullscreen) await el.requestFullscreen() } catch {}
          }

          const pipBtn = document.createElement('button')
          pipBtn.className = 'px-2 py-1 rounded bg-[#3f4147] text-white text-xs'
          pipBtn.textContent = 'Мини'
          pipBtn.onclick = async () => {
            try {
              if (document.pictureInPictureEnabled && (el as any).requestPictureInPicture) {
                await (el as any).requestPictureInPicture()
              }
            } catch {}
          }

          bar.appendChild(fullBtn)
          bar.appendChild(pipBtn)
          wrap.appendChild(el)
          wrap.appendChild(bar)

          remoteVideoElsRef.current.push(el)
          remoteVideoWrapRef.current.set(el, wrap)
          videoStageRef.current?.appendChild(wrap)
          setRemoteVideoCount(remoteVideoElsRef.current.length)
          return
        }

        if (track.kind !== 'audio') return
        const el = track.attach()
        el.autoplay = true
        el.style.display = 'none'
        el.volume = 1
        document.body.appendChild(el)
        remoteAudioElsRef.current.push(el)
        remoteAudioByIdentityRef.current[identity] = [...(remoteAudioByIdentityRef.current[identity] || []), el]

        try {
          if (!remoteAudioCtxRef.current) {
            remoteAudioCtxRef.current = new AudioContext()
            remoteMasterGainRef.current = remoteAudioCtxRef.current.createGain()
            remoteMasterGainRef.current.gain.value = 1
            remoteMasterGainRef.current.connect(remoteAudioCtxRef.current.destination)
          }
          const ctx = remoteAudioCtxRef.current
          const master = remoteMasterGainRef.current
          if (ctx && master) {
            const source = ctx.createMediaElementSource(el)
            remoteSourceNodesRef.current.set(el, source)

            if (!remoteUserGainsRef.current[identity]) {
              const g = ctx.createGain()
              g.gain.value = getOutputGainForIdentity(identity)
              g.connect(master)
              remoteUserGainsRef.current[identity] = g
            }

            source.connect(remoteUserGainsRef.current[identity])
          }
        } catch {
          // fallback without WebAudio graph
        }
      })
      room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        const identity = participant.identity
        const els = track.detach()

        if (track.kind === 'video') {
          els.forEach((el) => {
            const wrap = remoteVideoWrapRef.current.get(el)
            if (wrap) {
              wrap.remove()
              remoteVideoWrapRef.current.delete(el)
            } else {
              el.remove()
            }
            remoteVideoElsRef.current = remoteVideoElsRef.current.filter((x) => x !== el)
          })
          setRemoteVideoCount(remoteVideoElsRef.current.length)
          return
        }

        if (track.kind !== 'audio') return
        els.forEach((el) => {
          try {
            const src = remoteSourceNodesRef.current.get(el)
            if (src) {
              src.disconnect()
              remoteSourceNodesRef.current.delete(el)
            }
          } catch {}
          el.remove()
          remoteAudioElsRef.current = remoteAudioElsRef.current.filter((x) => x !== el)
          remoteAudioByIdentityRef.current[identity] = (remoteAudioByIdentityRef.current[identity] || []).filter((x) => x !== el)
        })

        if ((remoteAudioByIdentityRef.current[identity] || []).length === 0) {
          try { remoteUserGainsRef.current[identity]?.disconnect() } catch {}
          delete remoteUserGainsRef.current[identity]
        }
      })

      await room.connect(lkUrl, tokenData.token)
      setVoiceConnected(true)
      setJoinedVoiceChannelId(activeChannelId)

      try {
        await room.startAudio()
      } catch {
        // if autoplay is blocked, user can retry by re-entering voice
      }

      try {
        if (remoteAudioCtxRef.current?.state === 'suspended') {
          await remoteAudioCtxRef.current.resume()
        }
      } catch {}

      const hasGetUserMedia = typeof window !== 'undefined'
        && !!navigator?.mediaDevices
        && typeof navigator.mediaDevices.getUserMedia === 'function'

      if (hasGetUserMedia) {
        try {
          const constraints: MediaStreamConstraints = {
            audio: {
              deviceId: selectedAudioInputId ? { ideal: selectedAudioInputId } : undefined,
              echoCancellation: true,
              noiseSuppression: noiseSuppressionEnabled,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 48000,
            },
          }

          const rawStream = await navigator.mediaDevices.getUserMedia(constraints)
          localRawStreamRef.current = rawStream

          const rawTrack = rawStream.getAudioTracks()[0]
          if (rawTrack && noiseSuppressionEnabled) {
            try {
              await rawTrack.applyConstraints({
                advanced: [
                  { noiseSuppression: true },
                  { echoCancellation: true },
                  { autoGainControl: true },
                ],
              })
            } catch {
              // some browsers ignore advanced audio constraints
            }
          }

          const audioCtx = new AudioContext()
          localAudioCtxRef.current = audioCtx
          const source = audioCtx.createMediaStreamSource(rawStream)
          const gainNode = audioCtx.createGain()
          gainNode.gain.value = micGain / 100
          const dest = audioCtx.createMediaStreamDestination()
          source.connect(gainNode).connect(dest)

          const processedTrack = dest.stream.getAudioTracks()[0]
          if (!processedTrack) throw new Error('Не удалось получить обработанный аудио-трек')

          localMicTrackRef.current = processedTrack
          await room.localParticipant.publishTrack(processedTrack, { source: Track.Source.Microphone, name: 'mic' })
        } catch (micErr: any) {
          const msg = String(micErr?.message || micErr || '')
          setVoiceStatus(`Подключено без микрофона: ${msg || 'ошибка доступа к микрофону'}`)
        }
      } else {
        setVoiceStatus('Подключено без микрофона: браузер/протокол не поддерживает getUserMedia (нужен HTTPS или localhost).')
      }

      try {
        await supabase.from('voice_presence').upsert({
          channel_id: activeChannelId,
          user_id: sessionUserId,
          is_muted: muted,
          is_deafened: deafened,
          connected_at: new Date().toISOString(),
        })
        await loadVoicePresence(activeChannelId)
      } catch {
        // don't block UI if presence write fails
      }

      refreshVoiceMembers()
    } catch (e: any) {
      setVoiceConnected(false)
      setJoinedVoiceChannelId(null)
      setVoiceStatus(`Ошибка голоса: ${e?.message || 'неизвестно'}`)
    } finally {
      joiningVoiceRef.current = false
      setVoiceActionBusy(false)
    }
  }

  const leaveVoice = async () => {
    if (voiceActionBusy) return
    setVoiceActionBusy(true)

    const room = liveRoomRef.current
    if (room) {
      try {
        await room.disconnect()
      } catch {}
      liveRoomRef.current = null
    }

    if (sessionUserId) {
      await supabase.from('voice_presence').delete().eq('user_id', sessionUserId)
    }

    remoteVideoElsRef.current.forEach((el) => {
      const wrap = remoteVideoWrapRef.current.get(el)
      if (wrap) wrap.remove()
      else el.remove()
    })
    remoteVideoElsRef.current = []
    remoteVideoWrapRef.current.clear()
    setRemoteVideoCount(0)

    remoteAudioElsRef.current.forEach((el) => {
      try {
        const src = remoteSourceNodesRef.current.get(el)
        if (src) src.disconnect()
      } catch {}
      el.remove()
    })
    remoteAudioElsRef.current = []
    remoteAudioByIdentityRef.current = {}
    remoteSourceNodesRef.current.clear()
    Object.values(remoteUserGainsRef.current).forEach((g) => {
      try { g.disconnect() } catch {}
    })
    remoteUserGainsRef.current = {}
    if (remoteMasterGainRef.current) {
      try { remoteMasterGainRef.current.disconnect() } catch {}
      remoteMasterGainRef.current = null
    }
    if (remoteAudioCtxRef.current) {
      try { remoteAudioCtxRef.current.close() } catch {}
      remoteAudioCtxRef.current = null
    }

    if (localMicTrackRef.current) {
      try { localMicTrackRef.current.stop() } catch {}
      localMicTrackRef.current = null
    }
    if (localRawStreamRef.current) {
      localRawStreamRef.current.getTracks().forEach((t) => t.stop())
      localRawStreamRef.current = null
    }
    if (localAudioCtxRef.current) {
      try { localAudioCtxRef.current.close() } catch {}
      localAudioCtxRef.current = null
    }

    setJoinedVoiceChannelId(null)
    setVoiceConnected(false)
    setScreenSharing(false)
    setPttPressed(false)
    setVoiceUsers([])
    setVoiceMembers([])
    setVoiceStatus('')
    setVoiceActionBusy(false)
  }



  const addFriend = (userId: string) => {
    if (!sessionUserId || userId === sessionUserId) return
    setFriendsByUser((prev) => {
      const mine = new Set(prev[sessionUserId] || [])
      mine.add(userId)
      const other = new Set(prev[userId] || [])
      other.add(sessionUserId)
      return { ...prev, [sessionUserId]: Array.from(mine), [userId]: Array.from(other) }
    })
  }

  const sendDmMessage = () => {
    if (!sessionUserId || !activeDmUserId || !dmInput.trim()) return
    const key = dmPairKey(sessionUserId, activeDmUserId)
    const msg: DmMessage = {
      id: `dm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      from: sessionUserId,
      to: activeDmUserId,
      text: dmInput.trim(),
      createdAt: new Date().toISOString(),
    }
    setDmsByPair((prev) => ({ ...prev, [key]: [...(prev[key] || []), msg] }))
    setDmInput('')
  }

  const startDirectCall = async (peerId: string) => {
    if (!sessionUserId) return
    const roomId = `dm_${dmPairKey(sessionUserId, peerId)}`
    setActiveChannelId(roomId)
    setVoiceStatus(`Личный звонок: ${displayNameInChannel(peerId, peerId.slice(0, 8))}`)
    await joinVoice()
  }

  const searchFriends = async () => {
    const q = friendSearch.trim()
    if (!q) { setFriendResults([]); return }
    const { data } = await supabase.from('profiles').select('id,username').ilike('username', `%${q}%`).limit(20)
    const list = ((data as Profile[]) || []).filter((p) => p.id !== sessionUserId)
    setFriendResults(list)
  }


  const moveVoiceBlock = (from: 'screen' | 'presence' | 'fine', to: 'screen' | 'presence' | 'fine') => {
    if (from === to) return
    setVoiceLayout((prev) => {
      const arr = [...prev]
      const i = arr.indexOf(from)
      const j = arr.indexOf(to)
      if (i === -1 || j === -1) return prev
      arr.splice(i, 1)
      arr.splice(j, 0, from)
      return arr
    })
  }

  useEffect(() => {
    if (!activeServerId || !channels.length) return
    setChannelOrderByServer((prev) => {
      const existing = prev[activeServerId] || []
      const ids = channels.map((c) => c.id)
      const merged = [...existing.filter((id) => ids.includes(id)), ...ids.filter((id) => !existing.includes(id))]
      if (JSON.stringify(existing) === JSON.stringify(merged)) return prev
      return { ...prev, [activeServerId]: merged }
    })
  }, [activeServerId, channels])

  useEffect(() => {
    if (!servers.length) {
      if (activeServerId !== null) setActiveServerId(null)
      return
    }
    if (activeServerId && servers.some((srv) => srv.id === activeServerId)) return
    setActiveServerId(servers[0].id)
  }, [servers, activeServerId])

  useEffect(() => {
    if (!channels.length) {
      if (activeChannelId !== null) setActiveChannelId(null)
      return
    }
    if (activeChannelId && channels.some((ch) => ch.id === activeChannelId)) return
    setActiveChannelId(channels[0].id)
  }, [channels, activeChannelId])

  const moveChannel = (fromId: string, toId: string) => {
    if (!activeServerId || fromId === toId) return
    setChannelOrderByServer((prev) => {
      const current = [...(prev[activeServerId] || visibleChannels.map((c) => c.id))]
      const i = current.indexOf(fromId)
      const j = current.indexOf(toId)
      if (i === -1 || j === -1) return prev
      current.splice(i, 1)
      current.splice(j, 0, fromId)
      return { ...prev, [activeServerId]: current }
    })
  }

  const moveCategory = (fromId: string, toId: string) => {
    if (!activeServerId || fromId === toId) return
    setChannelCategoriesByServer((prev) => {
      const list = [...(prev[activeServerId] || [])]
      const i = list.findIndex((c) => c.id === fromId)
      const j = list.findIndex((c) => c.id === toId)
      if (i === -1 || j === -1) return prev
      const [item] = list.splice(i, 1)
      list.splice(j, 0, item)
      return { ...prev, [activeServerId]: list }
    })
  }

  const startRenameCategory = (id: string, currentName: string) => {
    setEditingCategoryId(id)
    setEditingCategoryName(currentName)
    setOpenCategoryMenuId(null)
  }

  const applyRenameCategory = () => {
    if (!activeServerId || !editingCategoryId || !editingCategoryName.trim()) {
      setEditingCategoryId(null)
      return
    }
    setChannelCategoriesByServer((prev) => ({
      ...prev,
      [activeServerId]: (prev[activeServerId] || []).map((c) => (c.id === editingCategoryId ? { ...c, name: editingCategoryName.trim() } : c)),
    }))
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const createChannelInCategory = async (categoryId: string, type: 'text' | 'voice') => {
    if (!activeServerId) return
    const baseName = type === 'text' ? 'новый-чат' : 'Новый голосовой'
    const { data: inserted, error } = await supabase
      .from('channels')
      .insert({
        server_id: activeServerId,
        name: `${baseName}-${Math.floor(Math.random() * 1000)}`,
        type,
        position: channels.length + 1,
      })
      .select('id')
      .single()

    if (error || !inserted?.id) return alert(error?.message || 'Ошибка создания канала')

    setChannelCategoryMapByServer((prev) => ({
      ...prev,
      [activeServerId]: { ...(prev[activeServerId] || {}), [inserted.id]: categoryId },
    }))
    await loadChannels(activeServerId)
    setOpenCategoryMenuId(null)
  }

  const deleteCategory = (id: string) => {
    if (!activeServerId) return
    if (id === 'text' || id === 'voice') return
    setChannelCategoriesByServer((prev) => ({
      ...prev,
      [activeServerId]: (prev[activeServerId] || []).filter((c) => c.id !== id),
    }))
    setChannelCategoryMapByServer((prev) => {
      const map = { ...(prev[activeServerId] || {}) }
      Object.keys(map).forEach((k) => { if (map[k] === id) delete map[k] })
      return { ...prev, [activeServerId]: map }
    })
  }

  const togglePTT = () => {
    setPttEnabled((prev) => {
      const next = !prev
      if (localMicTrackRef.current) {
        localMicTrackRef.current.enabled = next ? false : !muted
      }
      setPttPressed(false)
      return next
    })
  }

  const toggleScreenShare = async () => {
    const room = liveRoomRef.current
    if (!room) return
    try {
      await room.localParticipant.setScreenShareEnabled(!screenSharing, {
        audio: false,
        resolution: { width: 1920, height: 1080, frameRate: 30 },
        contentHint: 'detail',
      })
      setScreenSharing((v) => !v)
    } catch (e: any) {
      setVoiceStatus(`Ошибка трансляции экрана: ${e?.message || 'неизвестно'}`)
    }
  }

  const openScreenFullscreen = async () => {
    const v = remoteVideoElsRef.current[0] as HTMLVideoElement | undefined
    if (!v) return
    try {
      if (v.requestFullscreen) await v.requestFullscreen()
    } catch {}
  }

  const openScreenMiniWindow = async () => {
    const v = remoteVideoElsRef.current[0] as any
    if (!v) return
    try {
      if (document.pictureInPictureEnabled && v.requestPictureInPicture) {
        await v.requestPictureInPicture()
      }
    } catch {}
  }

  const updateVoiceFlags = async (nextMute: boolean, nextDeaf: boolean) => {
    setMuted(nextMute)
    setDeafened(nextDeaf)

    const room = liveRoomRef.current
    if (room) {
      if (localMicTrackRef.current) {
        localMicTrackRef.current.enabled = pttEnabled ? false : !nextMute
      }
      // v1: deafen flag is stored in DB/UI. Audio output routing controls can be expanded later.
      refreshVoiceMembers()
    }

    if (!sessionUserId || !joinedVoiceChannelId) return
    await supabase
      .from('voice_presence')
      .update({ is_muted: nextMute, is_deafened: nextDeaf })
      .eq('channel_id', joinedVoiceChannelId)
      .eq('user_id', sessionUserId)
  }

  if (!authReady) {
    return (
      <main className="min-h-screen bg-[#313338] text-[#dbdee1] flex items-center justify-center p-6">
        <div className="text-[#b5bac1] text-sm">Восстанавливаю сессию...</div>

    </main>
    )
  }

  if (!sessionUserId) {
    return (
      <main className="min-h-screen bg-[#313338] text-[#dbdee1] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#2b2d31] border border-[#1e1f22] rounded-xl p-6 space-y-4">
          <h1 className="text-2xl font-bold">Friends Voice</h1>
          <p className="text-sm text-[#b5bac1]">Вход по логину и паролю (логин admin поддерживается)</p>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <button
              onClick={() => setAuthMode('signin')}
              className={`rounded-lg py-2 ${authMode === 'signin' ? 'bg-[#5865f2]' : 'bg-[#1e1f22] border border-[#3f4147]'}`}
            >
              Вход
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`rounded-lg py-2 ${authMode === 'signup' ? 'bg-[#5865f2]' : 'bg-[#1e1f22] border border-[#3f4147]'}`}
            >
              Регистрация
            </button>
          </div>

          <input className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин (например admin) или email" />
          <input
            type="password"
            className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            onKeyDown={(e) => e.key === 'Enter' && authWithPassword()}
          />

          <button
            onClick={authWithPassword}
            disabled={authSending || authCooldownSec > 0}
            className="w-full rounded-lg bg-[#5865f2] hover:bg-[#4752c4] py-2 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {authSending ? 'Проверка...' : authCooldownSec > 0 ? `Повтор через ${authCooldownSec}с` : authMode === 'signin' ? 'Войти' : 'Создать аккаунт'}
          </button>
          {!!authInfo && <p className="text-xs text-zinc-300">{authInfo}</p>}
          <div className="text-[11px] text-[#949ba4] bg-[#1e1f22] border border-[#3f4147] rounded-lg p-2">
            В Supabase должен быть включен Email/Password provider (Authentication → Providers).
          </div>
        </div>

    </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#313338] to-[#2b2d31] text-[#dbdee1] grid grid-cols-[76px_286px_1fr_248px]">
      <aside className="border-r border-[#1e1f22] bg-[#1e1f22]/95 backdrop-blur p-3 space-y-4 flex flex-col items-center">
        <div className="h-10 w-10 rounded-xl bg-[#5865f2] flex items-center justify-center font-bold">FV</div>

        <div className="space-y-2 flex flex-col items-center">
          {servers.map((s) => {
            const active = activeServerId === s.id
            return (
              <div key={s.id} className="relative group flex items-center">
                <div className={`absolute -left-2 h-6 w-1 rounded-r-full transition-all ${active ? 'bg-white' : 'bg-white/0 group-hover:bg-white/50 group-hover:h-4'}`} />
                <button
                  onClick={() => {
                    setActiveServerId(s.id)
                    const remembered = lastChannelByServer[s.id]
                    if (remembered) setActiveChannelId(remembered)
                    setChannelSearch('')
                  }}
                  className={`h-12 w-12 transition-all duration-200 flex items-center justify-center font-bold text-sm tracking-wide ${active ? 'bg-[#5865f2] text-white rounded-2xl shadow-[0_0_0_2px_rgba(255,255,255,0.14)]' : 'rounded-[20px] bg-[#2b2d31] hover:bg-[#5865f2] hover:rounded-2xl text-[#dbdee1]'}`}
                >
                  {serverGlyph(s.name)}
                </button>
                <div className="absolute left-14 z-20 px-2 py-1 rounded bg-black/90 text-[11px] text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                  {s.name}
                </div>
              </div>
            )
          })}

          <div className="pt-2 mt-2 border-t border-[#2b2d31] space-y-2">
            <button
              title="Добавить сервер"
              onClick={() => setServerCreateOpen(true)}
              className="h-12 w-12 rounded-2xl bg-[#2b2d31] hover:bg-[#248046] text-[#dbdee1] font-bold text-xl transition-all"
            >
              +
            </button>
            <button
              title="Поиск сервера"
              onClick={() => { setServerSearchOpen(true); setServerSearchQuery(''); setInviteJoinOpen(false) }}
              className="h-12 w-12 rounded-2xl bg-[#2b2d31] hover:bg-[#5865f2] text-[#dbdee1] text-sm transition-all"
            >
              🔎
            </button>
          </div>
        </div>

        <div className="hidden space-y-2 pt-2 border-t border-[#1e1f22]">
          <input className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm" placeholder="Новый сервер" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
          <button onClick={createServer} className="w-full rounded-lg bg-[#248046] hover:bg-[#2d7d46] py-2 text-sm">Создать сервер</button>
          <input className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm" placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <button onClick={joinByInvite} className="w-full rounded-lg bg-[#3f4147] hover:bg-[#4e5058] py-2 text-sm">Вступить</button>
        </div>


        {isAdmin && (
          <div className="hidden space-y-2 pt-2 border-t border-[#1e1f22]">
            <h3 className="text-sm font-semibold text-zinc-300">Админ: добавление пользователей</h3>
            <input
              className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm"
              placeholder="Логин (например ivan) или email"
              value={adminNewLogin}
              onChange={(e) => setAdminNewLogin(e.target.value)}
            />
            <input
              type="password"
              className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm"
              placeholder="Пароль"
              value={adminNewPassword}
              onChange={(e) => setAdminNewPassword(e.target.value)}
            />
            <button
              onClick={adminCreateUser}
              disabled={adminBusy}
              className="w-full rounded-lg bg-[#5865f2] hover:bg-[#4752c4] py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {adminBusy ? 'Создаю...' : 'Создать пользователя'}
            </button>
            <p className="text-[11px] text-[#949ba4]">Создание выполняется через admin API (service role), публичные signups можно держать выключенными.</p>
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-[#1e1f22] space-y-2 w-full flex flex-col items-center">
          <button onClick={() => void logout()} disabled={loggingOut} title="Выйти" className="h-10 w-10 rounded-xl bg-[#da373c] hover:bg-[#a12828] text-sm disabled:opacity-60">
            ⎋
          </button>
        </div>
      </aside>

      <aside className="border-r border-[#202225] bg-[#2f3136] p-4 space-y-4">
        <div className="flex items-start justify-between gap-2"><div><h2 className="font-bold tracking-wide">Каналы</h2><div className="text-[11px] text-[#b5bac1]">{servers.find((x) => x.id === activeServerId)?.name || 'Сервер'}</div><div className="text-[10px] text-[#949ba4] leading-tight">↑/↓ + Enter для навигации • Ctrl+K поиск</div></div><button onClick={() => { setQuickSwitcherOpen(true); setQuickSwitcherQuery(''); setQuickSwitcherIndex(0) }} className="text-[10px] px-2 py-1 rounded bg-[#1e1f22] border border-[#3f4147] text-[#b5bac1] hover:bg-[#2a2d31]">Ctrl+K</button></div>

        <div className="space-y-2">
          <input
            className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm"
            placeholder="Поиск канала..."
            value={channelSearch}
            onChange={(e) => setChannelSearch(e.target.value)}
          />

          {categorizedChannelGroups.map((group) => (
            <div key={group.id} draggable onDragStart={() => setDragCategoryId(group.id)} onDragEnter={() => setDropCategoryId(group.id)} onDragLeave={() => setDropCategoryId((prev) => (prev === group.id ? null : prev))} onDragOver={(e) => e.preventDefault()} onDrop={() => {
              if (dragCategoryId) {
                moveCategory(dragCategoryId, group.id)
                setDragCategoryId(null)
                setDropCategoryId(null)
                return
              }
              if (!activeServerId || !dragChannelId) return
              setChannelCategoryMapByServer((prev) => ({
                ...prev,
                [activeServerId]: { ...(prev[activeServerId] || {}), [dragChannelId]: group.id },
              }))
              setDragChannelId(null)
              setDropCategoryId(null)
            }} className={`rounded ${dropCategoryId === group.id ? 'ring-1 ring-[#5865f2] bg-[#5865f2]/10' : ''}`}>
              <div className="w-full flex items-center gap-1 text-[11px] font-semibold text-[#b5bac1] mb-1 relative uppercase tracking-wide" onContextMenu={(e) => { e.preventDefault(); setOpenCategoryMenuId((prev) => prev === group.id ? null : group.id) }}>
                {editingCategoryId === group.id ? (
                  <input
                    autoFocus
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    onBlur={applyRenameCategory}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyRenameCategory()
                      if (e.key === 'Escape') { setEditingCategoryId(null); setEditingCategoryName('') }
                    }}
                    className="flex-1 rounded bg-[#1e1f22] border border-[#3f4147] px-2 py-1 text-xs"
                  />
                ) : (
                  <button
                    onClick={() => {
                      if (!activeServerId) return
                      setChannelCategoriesByServer((prev) => ({
                        ...prev,
                        [activeServerId]: (prev[activeServerId] || []).map((c) => c.id === group.id ? { ...c, collapsed: !c.collapsed } : c),
                      }))
                    }}
                    className="text-left flex-1"
                  >
                    {group.collapsed ? '▸' : '▾'} {group.name} — {group.channels.length}
                  </button>
                )}
                <button onClick={() => setOpenCategoryMenuId((prev) => prev === group.id ? null : group.id)} className="px-1 rounded bg-[#3f4147]">⋮</button>
                <button onClick={() => startRenameCategory(group.id, group.name)} className="px-1 rounded bg-[#3f4147]">✎</button>
                <button onClick={() => deleteCategory(group.id)} disabled={group.id === 'text' || group.id === 'voice'} className="px-1 rounded bg-[#3f4147] disabled:opacity-40">✕</button>
                {openCategoryMenuId === group.id && (isServerOwner) && (
                  <div className="absolute right-0 top-6 z-20 bg-[#1e1f22] border border-[#3f4147] rounded p-1 flex gap-1 shadow-lg animate-[fadeIn_.12s_ease-out]">
                    <button onClick={() => void createChannelInCategory(group.id, 'text')} className="px-2 py-1 rounded text-[11px] bg-[#3f4147]">+Text</button>
                    <button onClick={() => void createChannelInCategory(group.id, 'voice')} className="px-2 py-1 rounded text-[11px] bg-[#3f4147]">+Voice</button>
                  </div>
                )}
              </div>
              {!group.collapsed && group.channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveChannelId(c.id)}
                  draggable
                  onDragStart={() => setDragChannelId(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragChannelId) return
                    moveChannel(dragChannelId, c.id)
                    setDragChannelId(null)
                  }}
                  className={`w-full text-left px-2 py-[6px] rounded-md mb-1 transition-all shadow-sm ${activeChannelId === c.id ? 'bg-[#404249] text-white' : channelNavIndex >= 0 && navigableChannelIds[channelNavIndex] === c.id ? 'bg-[#3a3c43]' : 'bg-transparent hover:bg-[#35373c]'}`}
                >
                  <span className="inline-flex w-4 text-xs text-zinc-300 mr-2 justify-center">{c.type === 'text' ? '#' : '🔊'}</span>
                  {c.name}
                  {activeChannelId === c.id && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-white/90" />}
                </button>
              ))}
            </div>
          ))}

          {activeServerId && (
            <div className="pt-2 border-t border-[#1e1f22] space-y-2">
              <input className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm" placeholder="Новая категория" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              <button onClick={() => {
                if (!activeServerId || !newCategoryName.trim()) return
                const id = `cat_${Date.now().toString(36)}`
                setChannelCategoriesByServer((prev) => ({
                  ...prev,
                  [activeServerId]: [...(prev[activeServerId] || []), { id, name: newCategoryName.trim(), collapsed: false }],
                }))
                setNewCategoryName('')
              }} className="w-full rounded-lg bg-[#3f4147] hover:bg-[#4e5058] py-2 text-sm">Создать категорию</button>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-[#1e1f22]">
          <h3 className="text-sm font-semibold text-[#b5bac1] mb-2">Участники сервера: {serverMembers.length}</h3>
          <div className="space-y-1 max-h-44 overflow-auto pr-1">
            {serverMembers.map((m) => {
              const inVoice = voiceUserSet.has(m.id)
              const isMe = m.id === sessionUserId
              return (
                <div key={m.id} className="mb-1">
                  <div className="px-2 py-1 rounded bg-[#1e1f22] text-sm text-[#dbdee1] truncate flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span>{displayNameInChannel(m.id, m.name)}{isMe ? ' (вы)' : ''}</span>
                      <span className={`ml-2 text-[10px] px-1 rounded ${m.role === 'owner' ? 'bg-[#5865f2] text-white' : 'bg-[#3f4147] text-[#dbdee1]'}`}>{m.role}</span>
                      {channelMetaForActive[m.id]?.isAdmin && <span className="ml-1 text-[10px] px-1 rounded bg-emerald-700 text-white">админ канала</span>}
                    </div>
                    <span className={inVoice ? 'text-emerald-400 text-xs' : 'text-[#949ba4] text-xs'}>{inVoice ? 'в голосе' : 'офлайн'}</span>
                  </div>
                  {isServerOwner && !!activeChannelId && (
                    <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => setChannelMemberMetaByChannel((prev) => ({
                        ...prev,
                        [activeChannelId]: {
                          ...(prev[activeChannelId] || {}),
                          [m.id]: {
                            ...(prev[activeChannelId]?.[m.id] || {}),
                            isAdmin: !(prev[activeChannelId]?.[m.id]?.isAdmin),
                          },
                        },
                      }))}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#3f4147] hover:bg-[#4e5058]"
                    >
                      {channelMetaForActive[m.id]?.isAdmin ? 'Снять админа' : 'Сделать админом'}
                    </button>
                    <button
                      onClick={() => {
                        const current = channelMetaForActive[m.id]?.nick || ''
                        const next = window.prompt(`Ник в канале для ${m.name}`, current)
                        if (next === null || !activeChannelId) return
                        setChannelMemberMetaByChannel((prev) => ({
                          ...prev,
                          [activeChannelId]: {
                            ...(prev[activeChannelId] || {}),
                            [m.id]: {
                              ...(prev[activeChannelId]?.[m.id] || {}),
                              nick: next.trim(),
                            },
                          },
                        }))
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#3f4147] hover:bg-[#4e5058]"
                    >
                      Ник в канале
                    </button>
                  </div>
                )}
                </div>
              )
            })}
            {!serverMembers.length && <div className="text-xs text-[#949ba4]">Пока пусто</div>}
          </div>
        </div>

        {activeServerId && isServerOwner && (
          <div className="space-y-2 pt-2 border-t border-[#1e1f22]">
            <input className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm" placeholder="Новый канал" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
            <select className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm" value={newChannelType} onChange={(e) => setNewChannelType(e.target.value as 'text' | 'voice')}>
              <option value="text">Text</option>
              <option value="voice">Voice</option>
            </select>
            <button onClick={createChannel} className="w-full rounded-lg bg-[#3f4147] hover:bg-[#4e5058] py-2 text-sm">Создать канал</button>
          </div>
        )}

        {!!activeChannelId && (
          <div className="space-y-2 pt-2 border-t border-[#1e1f22]">
            <h3 className="text-sm font-semibold text-[#b5bac1]">Права канала (beta)</h3>
            <select
              className="w-full rounded bg-[#1e1f22] border border-[#3f4147] px-2 py-1 text-sm"
              value={channelPerms[activeChannelId]?.role || 'member'}
              onChange={(e) => setChannelPerms((prev) => ({
                ...prev,
                [activeChannelId]: {
                  role: e.target.value as 'owner' | 'member',
                  canView: prev[activeChannelId]?.canView ?? true,
                  canSend: prev[activeChannelId]?.canSend ?? true,
                  canSpeak: prev[activeChannelId]?.canSpeak ?? true,
                },
              }))}
            >
              <option value="owner">owner</option>
              <option value="member">member</option>
            </select>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={channelPerms[activeChannelId]?.canView ?? true} onChange={(e) => setChannelPerms((prev) => ({ ...prev, [activeChannelId]: { role: prev[activeChannelId]?.role || 'member', canView: e.target.checked, canSend: prev[activeChannelId]?.canSend ?? true, canSpeak: prev[activeChannelId]?.canSpeak ?? true } }))} /> canView</label>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={channelPerms[activeChannelId]?.canSend ?? true} onChange={(e) => setChannelPerms((prev) => ({ ...prev, [activeChannelId]: { role: prev[activeChannelId]?.role || 'member', canView: prev[activeChannelId]?.canView ?? true, canSend: e.target.checked, canSpeak: prev[activeChannelId]?.canSpeak ?? true } }))} /> canSend</label>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={channelPerms[activeChannelId]?.canSpeak ?? true} onChange={(e) => setChannelPerms((prev) => ({ ...prev, [activeChannelId]: { role: prev[activeChannelId]?.role || 'member', canView: prev[activeChannelId]?.canView ?? true, canSend: prev[activeChannelId]?.canSend ?? true, canSpeak: e.target.checked } }))} /> canSpeak</label>
          </div>
        )}

        <div className="mt-3 rounded-lg bg-[#232428] border border-[#1e1f22] p-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#f0b132] to-[#f28c2d] flex items-center justify-center text-xs font-bold text-black">
              {(profile?.username || sessionEmail || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{profile?.username || sessionEmail?.split('@')[0] || 'Пользователь'}</div>
              <div className="text-[11px] text-emerald-400">В сети</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => updateVoiceFlags(!muted, deafened)} className="h-8 w-8 rounded-md bg-[#2b2d31] hover:bg-[#3a3d44] text-sm" title="Микрофон">🎙️</button>
            <button onClick={() => updateVoiceFlags(muted, !deafened)} className="h-8 w-8 rounded-md bg-[#2b2d31] hover:bg-[#3a3d44] text-sm" title="Звук">🎧</button>
            <button onClick={() => { setProfileNameDraft(profile?.username || ''); setProfileEditorOpen(true) }} className="h-8 w-8 rounded-md bg-[#2b2d31] hover:bg-[#3a3d44] text-sm" title="Профиль">⚙️</button>
          </div>
        </div>
      </aside>

      <section className="p-0 flex flex-col min-h-screen bg-[#313338]">
        <div className="h-12 border-b border-[#202225] flex items-center justify-between px-4 bg-[#313338]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[#949ba4] font-bold">{activeChannel?.type === 'voice' ? '🔊' : '#'}</span>
            <h1 className="text-base font-semibold truncate">{activeChannel?.name || 'Выбери канал'}</h1>
            <span className="text-xs text-[#949ba4] truncate">{activeChannel?.type === 'text' ? 'Текстовый канал' : 'Голосовой канал'}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-[#b5bac1]">
            <button className="px-2 py-1 rounded hover:bg-[#2b2d31]">📌</button>
            <button className="px-2 py-1 rounded hover:bg-[#2b2d31]">🔔</button>
            <button onClick={() => setFriendsOpen(true)} className="px-2 py-1 rounded hover:bg-[#2b2d31]">👥</button>
            <div className="ml-2 px-2 py-1 rounded bg-[#1e1f22] border border-[#3f4147] text-[#949ba4]">Поиск</div>
          </div>
        </div>

        {activeChannel?.type === 'text' && (
          <>
            <div className="flex-1 overflow-auto py-4 px-2 space-y-0">
              {messages.map((m) => (
                <div key={m.id} className="group rounded-lg px-2 py-1 hover:bg-[#2b2d31] transition-colors">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#5865f2] to-[#4752c4] flex items-center justify-center text-[11px] font-semibold mt-0.5">{(m.author_id || 'U').slice(0,2).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-[#f2f3f5]">{getUserDisplayName(m.author_id)}</span>
                        <span className="text-[12px] text-[#949ba4]">{new Date(m.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-[15px] leading-[1.375rem] text-[#dbdee1] break-words">{m.content}</div>
                      <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button className="h-6 w-6 rounded bg-[#1e1f22] border border-[#3f4147] text-[11px]">😊</button>
                        <button className="h-6 w-6 rounded bg-[#1e1f22] border border-[#3f4147] text-[11px]">⋯</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!messages.length && <div className="text-[#949ba4] text-sm">Сообщений пока нет</div>}
            </div>

            <div className="px-4 pb-6 pt-3">
              <div className="flex gap-2 rounded-lg bg-[#383a40] px-3 py-2">
                <button className="text-[#b5bac1] hover:text-white">＋</button>
                <input className="flex-1 bg-transparent outline-none" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={`Написать в #${activeChannel?.name || 'канал'}`} disabled={!!activeChannelId && channelPerms[activeChannelId] ? !channelPerms[activeChannelId].canSend : false} />
                <div className="flex items-center gap-1">
                  <button className="h-7 w-7 rounded text-[#b5bac1] hover:text-white hover:bg-[#4a4d55]">🎁</button>
                  <button className="h-7 w-7 rounded text-[#b5bac1] hover:text-white hover:bg-[#4a4d55]">😀</button>
                  <button onClick={sendMessage} className="px-3 rounded-lg bg-[#5865f2] hover:bg-[#4752c4]" disabled={!!activeChannelId && channelPerms[activeChannelId] ? !channelPerms[activeChannelId].canSend : false}>Отпр.</button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeChannel?.type === 'voice' && (
          <div className="py-4 space-y-4 flex flex-col">
            <div className="bg-[#2b2d31] border border-[#1e1f22] rounded-lg p-4 space-y-3 sticky top-3 z-10">
              <div className="text-sm text-zinc-300">Стабильный голосовой чат (LiveKit/WebRTC).</div>
              <div className="text-xs text-[#b5bac1]">{voiceStatus}</div>

              <div className="space-y-2">
                <label className="text-xs text-[#b5bac1]">Микрофон (вход)</label>
                <select
                  value={selectedAudioInputId}
                  onChange={(e) => setSelectedAudioInputId(e.target.value)}
                  className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] px-3 py-2 text-sm"
                >
                  {audioInputs.length === 0 && <option value="">По умолчанию</option>}
                  {audioInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Микрофон ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#b5bac1]">Усиление микрофона: {micGain}%</label>
                <input type="range" min={0} max={300} value={micGain} onChange={(e) => setMicGain(Number(e.target.value))} className="w-full" />
                <p className="text-[11px] text-[#949ba4]">Рекомендуется 90–140% для чистого звука без перегруза.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#b5bac1]">Очистка шума</label>
                <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={noiseSuppressionEnabled} onChange={(e) => setNoiseSuppressionEnabled(e.target.checked)} />
                  Улучшенное шумоподавление
                </label>
                <p className="text-[11px] text-[#949ba4]">Включено по умолчанию: лучше режет фоновые шумы и эхо.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#b5bac1]">Громкость выхода: {masterVolume}%</label>
                <input type="range" min={0} max={400} value={masterVolume} onChange={(e) => setMasterVolume(Number(e.target.value))} className="w-full" />
                <p className="text-[11px] text-[#949ba4]">Можно усилить до 400% (через WebAudio), если собеседники тихие.</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {!voiceConnected && <button onClick={joinVoice} className="px-4 py-2 rounded-lg bg-[#248046] hover:bg-[#2d7d46]">Подключиться</button>}
                {!!voiceConnected && <button onClick={leaveVoice} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500">Отключиться</button>}
                <button onClick={() => updateVoiceFlags(!muted, deafened)} className={`px-4 py-2 rounded-lg ${muted ? 'bg-yellow-700' : 'bg-[#3f4147]'} hover:opacity-90`}>{muted ? 'Микрофон: выкл' : 'Микрофон: вкл'}</button>
                <button onClick={() => updateVoiceFlags(muted, !deafened)} className={`px-4 py-2 rounded-lg ${deafened ? 'bg-yellow-700' : 'bg-[#3f4147]'} hover:opacity-90`}>{deafened ? 'Звук: выкл' : 'Звук: вкл'}</button>
                {!!voiceConnected && <button onClick={toggleScreenShare} className={`px-4 py-2 rounded-lg ${screenSharing ? 'bg-[#5865f2]' : 'bg-[#3f4147]'} hover:opacity-90`}>{screenSharing ? 'Остановить трансляцию' : 'Трансляция экрана'}</button>}
              </div>
            </div>

            <div className="bg-[#2b2d31] border border-[#1e1f22] rounded-lg p-4" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', 'screen')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => moveVoiceBlock(e.dataTransfer.getData('text/plain') as any, 'screen')} style={{ order: voiceLayout.indexOf('screen') }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Трансляция экрана ({remoteVideoCount})</h3>
                <div className="flex gap-2">
                  <button onClick={openScreenFullscreen} className="px-2 py-1 rounded bg-[#5865f2] text-xs">Полный экран</button>
                  <button onClick={openScreenMiniWindow} className="px-2 py-1 rounded bg-[#3f4147] text-xs">Мини-окно</button>
                </div>
              </div>
              <div ref={videoStageRef} className="fixed bottom-4 right-4 z-40 flex flex-col gap-2" />
              <div className="text-sm text-[#949ba4]">Трансляции показываются маленьким окном как в Discord (справа внизу).</div>
            </div>

            <div className="bg-[#2b2d31] border border-[#1e1f22] rounded-lg p-4" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', 'presence')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => moveVoiceBlock(e.dataTransfer.getData('text/plain') as any, 'presence')} style={{ order: voiceLayout.indexOf('presence') }}>
              <h3 className="font-semibold mb-2">Кто в голосовом канале: {voiceUsers.length}</h3>
              <div className="space-y-2">
                {voiceUsers.map((u) => {
                  const name = voiceUserNames[u.user_id] || u.user_id.slice(0, 8)
                  return (
                    <div key={u.user_id} className="bg-[#1e1f22] rounded px-3 py-2 text-sm flex items-center justify-between">
                      <span>{name}</span>
                      <span className="text-[#b5bac1]">{u.is_muted ? '🔇' : '🎙️'} {u.is_deafened ? '🙉' : '👂'}</span>
                    </div>
                  )
                })}
                {!voiceUsers.length && <div className="text-sm text-[#949ba4]">Пока никого нет</div>}
              </div>
            </div>

            {!!voiceMembers.length && (
              <div className="bg-[#2b2d31] border border-[#1e1f22] rounded-lg p-4" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', 'fine')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => moveVoiceBlock(e.dataTransfer.getData('text/plain') as any, 'fine')} style={{ order: voiceLayout.indexOf('fine') }}>
                <h3 className="font-semibold mb-2">Точная настройка громкости</h3>
                <div className="space-y-2">
                  {sortedVoiceMembers.map((v) => (
                    <div key={v.identity} className="bg-[#1e1f22] rounded px-3 py-2 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span>{displayNameInChannel(v.identity, v.name)}</span>
                        <span className="text-zinc-300">{v.speaking ? '🟢 говорит' : '⚪'} {v.micEnabled ? '🎙️' : '🔇'}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-[#b5bac1]">Громкость {v.name}: {(userVolumes[v.identity] ?? 100)}%</label>
                          <div className="flex gap-1 relative">
                            <button
                              onClick={() => setUserVolumes((prev) => ({ ...prev, [v.identity]: 100 }))}
                              className="px-2 py-1 rounded text-xs bg-[#3f4147]"
                            >
                              100%
                            </button>
                            <button
                              onClick={() => setPinnedIdentity((prev) => (prev === v.identity ? null : v.identity))}
                              className={`px-2 py-1 rounded text-xs ${pinnedIdentity === v.identity ? 'bg-[#5865f2]' : 'bg-[#3f4147]'}`}
                            >
                              {pinnedIdentity === v.identity ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              onClick={() => setMutedUsers((prev) => ({ ...prev, [v.identity]: !prev[v.identity] }))}
                              className={`px-2 py-1 rounded text-xs ${mutedUsers[v.identity] ? 'bg-[#da373c]' : 'bg-[#3f4147]'}`}
                            >
                              {mutedUsers[v.identity] ? 'Размутить' : 'Локально mute'}
                            </button>
                            <button
                              onClick={() => setOpenMemberMenuId((prev) => (prev === v.identity ? null : v.identity))}
                              className="px-2 py-1 rounded text-xs bg-[#3f4147]"
                            >
                              ⋮
                            </button>
                            {openMemberMenuId === v.identity && (
                              <div className="absolute right-0 top-8 z-20 bg-[#1e1f22] border border-[#3f4147] rounded p-1 flex gap-1">
                                <button onClick={() => { setUserVolumes((prev) => ({ ...prev, [v.identity]: 80 })); setOpenMemberMenuId(null) }} className="px-2 py-1 text-xs rounded bg-[#3f4147]">80%</button>
                                <button onClick={() => { setUserVolumes((prev) => ({ ...prev, [v.identity]: 150 })); setOpenMemberMenuId(null) }} className="px-2 py-1 text-xs rounded bg-[#3f4147]">150%</button>
                                <button onClick={() => { setUserVolumes((prev) => ({ ...prev, [v.identity]: 200 })); setOpenMemberMenuId(null) }} className="px-2 py-1 text-xs rounded bg-[#3f4147]">200%</button>
                              </div>
                            )}
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={400}
                          value={userVolumes[v.identity] ?? 100}
                          onChange={(e) => setUserVolumes((prev) => ({ ...prev, [v.identity]: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {voiceConnected && (
          <div className="fixed bottom-3 left-[572px] right-3 z-50 bg-[#1e1f22]/95 backdrop-blur border border-[#3f4147] rounded-xl px-3 py-2 flex items-center justify-between shadow-2xl">
            <div>
              <div className="text-sm font-semibold text-[#dbdee1]">Голосовая связь подключена</div>
              <div className="text-xs text-[#949ba4]">{activeChannel?.name || 'Канал'} • {voiceMembers.length} участников • Ctrl+M микрофон • Ctrl+D звук</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateVoiceFlags(!muted, deafened)} className={`px-3 py-1 rounded ${muted ? 'bg-[#da373c]' : 'bg-[#3f4147]'} text-sm`}>{muted ? '🔇' : '🎙️'}</button>
              <button onClick={() => updateVoiceFlags(muted, !deafened)} className={`px-3 py-1 rounded ${deafened ? 'bg-[#da373c]' : 'bg-[#3f4147]'} text-sm`}>{deafened ? '🙉' : '🔊'}</button>
              <button onClick={toggleScreenShare} className={`px-3 py-1 rounded ${screenSharing ? 'bg-[#5865f2]' : 'bg-[#3f4147]'} text-sm`}>🖥️</button>
              <button onClick={togglePTT} className={`px-3 py-1 rounded ${pttEnabled ? 'bg-[#5865f2]' : 'bg-[#3f4147]'} text-sm`}>{pttEnabled ? (pttPressed ? 'PTT: НАЖАТ' : 'PTT: ON') : 'PTT: OFF'}</button>
              <button onClick={leaveVoice} disabled={voiceActionBusy} className="px-3 py-1 rounded bg-[#da373c] text-sm disabled:opacity-60">{voiceActionBusy ? '...' : 'Отключиться'}</button>
            </div>
          </div>
        )}
      </section>

      <aside className="border-l border-[#202225] bg-[#2f3136] p-4">
        <h3 className="font-semibold mb-3">Голосовая панель</h3>
        {!voiceConnected && <div className="text-xs text-[#949ba4]">Подключитесь к voice-каналу</div>}
        {!!voiceConnected && (
          <div className="space-y-2">
            {sortedVoiceMembers.map((v) => (
              <div
                key={v.identity}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setOpenMemberMenuId((prev) => (prev === v.identity ? null : v.identity))
                }}
                className={`rounded-lg px-3 py-2 border relative transition-all duration-150 ${v.speaking ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]' : 'border-[#1e1f22] bg-[#1e1f22]'}`}
              >
                <div className="flex items-center justify-between text-sm gap-2">
                  <div className="truncate">
                    <span className="truncate">{displayNameInChannel(v.identity, v.name)}</span>
                    <span className={`ml-2 text-[10px] px-1 rounded ${serverRoleById[v.identity] === 'owner' ? 'bg-[#5865f2] text-white' : 'bg-[#3f4147] text-[#dbdee1]'}`}>{serverRoleById[v.identity] || 'member'}</span>
                  </div>
                  <span className="text-xs">{v.speaking ? 'говорит' : 'тихо'}</span>
                </div>
                <div className="mt-1 text-[11px] text-[#949ba4]">{v.micEnabled ? '🎙️ микрофон' : '🔇 без микрофона'}</div>
                {openMemberMenuId === v.identity && (
                  <div className="mt-2 flex gap-1">
                    <button onClick={() => { setPinnedIdentity((prev) => (prev === v.identity ? null : v.identity)); setOpenMemberMenuId(null) }} className="px-2 py-1 rounded text-[11px] bg-[#3f4147]">Pin</button>
                    <button onClick={() => { setMutedUsers((prev) => ({ ...prev, [v.identity]: !prev[v.identity] })); setOpenMemberMenuId(null) }} className="px-2 py-1 rounded text-[11px] bg-[#3f4147]">Mute</button>
                    <button onClick={() => { setUserVolumes((prev) => ({ ...prev, [v.identity]: 100 })); setOpenMemberMenuId(null) }} className="px-2 py-1 rounded text-[11px] bg-[#3f4147]">100%</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>

      {friendsOpen && (
        <div className="fixed inset-0 z-[71] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFriendsOpen(false)}>
          <div className="w-full max-w-4xl h-[78vh] bg-[#1e1f22] border border-[#3f4147] rounded-xl shadow-2xl grid grid-cols-[280px_1fr]" onClick={(e) => e.stopPropagation()}>
            <div className="border-r border-[#3f4147] p-3 space-y-3">
              <div className="text-sm font-semibold">Друзья</div>
              <div className="flex gap-2">
                <input value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} placeholder="Поиск пользователя" className="flex-1 rounded bg-[#2b2d31] border border-[#3f4147] px-2 py-1.5 text-sm" />
                <button onClick={() => void searchFriends()} className="px-2 rounded bg-[#5865f2] text-sm">Найти</button>
              </div>
              {!!friendResults.length && (
                <div className="space-y-1 max-h-40 overflow-auto">
                  {friendResults.map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-xs bg-[#2b2d31] rounded px-2 py-1">
                      <span className="truncate">{u.username || u.id.slice(0, 8)}</span>
                      <button onClick={() => addFriend(u.id)} className="px-2 py-0.5 rounded bg-[#248046]">Добавить</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2 border-t border-[#3f4147] text-xs text-[#949ba4]">Мои друзья</div>
              <div className="space-y-1 overflow-auto">
                {friendProfiles.map((f) => (
                  <button key={f.id} onClick={() => setActiveDmUserId(f.id)} className={`w-full text-left px-2 py-2 rounded text-sm ${activeDmUserId===f.id?'bg-[#5865f2]':'bg-[#2b2d31] hover:bg-[#3a3d44]'}`}>
                    {displayNameInChannel(f.id, f.username || f.id.slice(0,8))}
                  </button>
                ))}
                {!friendProfiles.length && <div className="text-xs text-[#949ba4]">Пока нет друзей</div>}
              </div>
            </div>
            <div className="p-3 flex flex-col min-h-0">
              {!activeDmUserId && <div className="text-sm text-[#949ba4]">Выберите друга для личного чата</div>}
              {!!activeDmUserId && (
                <>
                  <div className="flex items-center justify-between border-b border-[#3f4147] pb-2 mb-2">
                    <div className="font-semibold">ЛС: {displayNameInChannel(activeDmUserId, activeDmUserId.slice(0,8))}</div>
                    <button onClick={() => void startDirectCall(activeDmUserId)} disabled={voiceActionBusy} className="px-3 py-1 rounded bg-[#5865f2] text-sm disabled:opacity-60">Позвонить</button>
                  </div>
                  <div className="flex-1 overflow-auto space-y-2 pr-1">
                    {activeDmMessages.map((m) => (
                      <div key={m.id} className={`max-w-[78%] px-3 py-2 rounded-lg text-sm ${m.from===sessionUserId?'ml-auto bg-[#5865f2]':'bg-[#2b2d31]'}`}>
                        {m.text}
                        <div className="text-[10px] opacity-70 mt-1">{new Date(m.createdAt).toLocaleTimeString()}</div>
                      </div>
                    ))}
                    {!activeDmMessages.length && <div className="text-xs text-[#949ba4]">Сообщений пока нет</div>}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input value={dmInput} onChange={(e)=>setDmInput(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter') sendDmMessage()}} className="flex-1 rounded bg-[#2b2d31] border border-[#3f4147] px-3 py-2 text-sm" placeholder="Сообщение..." />
                    <button onClick={sendDmMessage} className="px-3 py-2 rounded bg-[#5865f2] text-sm">Отпр.</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {profileEditorOpen && (
        <div className="fixed inset-0 z-[73] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setProfileEditorOpen(false)}>
          <div className="w-full max-w-md bg-[#1e1f22] border border-[#3f4147] rounded-xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-3">Редактор профиля</div>
            <div className="text-xs text-[#949ba4] mb-2">Имя будет показываться в каналах и списках участников.</div>
            <input
              autoFocus
              value={profileNameDraft}
              onChange={(e) => setProfileNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveProfileName() }}
              className="w-full rounded-lg bg-[#2b2d31] border border-[#3f4147] px-3 py-2 text-sm outline-none"
              placeholder="Введите имя"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setProfileEditorOpen(false)} className="px-3 py-2 rounded-lg bg-[#3f4147] text-sm">Отмена</button>
              <button onClick={() => void saveProfileName()} className="px-3 py-2 rounded-lg bg-[#5865f2] text-sm">Сохранить</button>
            </div>
          </div>
        </div>
      )}


      {quickSwitcherOpen && (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24" onClick={() => setQuickSwitcherOpen(false)}>
          <div className="w-full max-w-xl bg-[#1e1f22] border border-[#3f4147] rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={quickSwitcherQuery}
              onChange={(e) => { setQuickSwitcherQuery(e.target.value); setQuickSwitcherIndex(0) }}
              placeholder="Перейти к каналу..."
              className="w-full bg-transparent border-b border-[#3f4147] px-4 py-3 outline-none"
            />
            <div className="max-h-72 overflow-auto p-2">
              {quickSwitcherChannels.map((c, idx) => (
                <button
                  key={c.id}
                  onClick={() => { setActiveChannelId(c.id); setQuickSwitcherOpen(false) }}
                  className={`w-full text-left px-3 py-2 rounded mb-1 ${idx === quickSwitcherIndex ? 'bg-[#5865f2]' : 'bg-[#2b2d31] hover:bg-[#3a3d44]'}`}
                >
                  <span className="inline-flex w-4 mr-2 justify-center text-xs">{c.type === 'text' ? '#' : '🔊'}</span>
                  {c.name}
                  {activeChannelId === c.id && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-white/90" />}
                </button>
              ))}
              {!quickSwitcherChannels.length && <div className="text-sm text-[#949ba4] px-3 py-2">Ничего не найдено</div>}
            </div>
          </div>
        </div>
      )}

      {serverCreateOpen && (
        <div className="fixed inset-0 z-[72] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setServerCreateOpen(false)}>
          <div className="w-full max-w-md bg-[#1e1f22] border border-[#3f4147] rounded-xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-3">Создать сервер</div>
            <input
              autoFocus
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void createServer() }}
              placeholder="Название сервера"
              className="w-full rounded-lg bg-[#2b2d31] border border-[#3f4147] px-3 py-2 text-sm outline-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setServerCreateOpen(false)} className="px-3 py-2 rounded-lg bg-[#3f4147] text-sm">Отмена</button>
              <button onClick={() => void createServer()} className="px-3 py-2 rounded-lg bg-[#248046] text-sm">Создать</button>
            </div>
          </div>
        </div>
      )}

      {serverSearchOpen && (
        <div className="fixed inset-0 z-[72] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24 p-4" onClick={() => setServerSearchOpen(false)}>
          <div className="w-full max-w-lg bg-[#1e1f22] border border-[#3f4147] rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={serverSearchQuery}
              onChange={(e) => setServerSearchQuery(e.target.value)}
              placeholder="Поиск сервера по названию..."
              className="w-full bg-transparent border-b border-[#3f4147] px-4 py-3 outline-none"
            />
            <div className="max-h-80 overflow-auto p-2">
              {serverSearchResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveServerId(s.id)
                    if (lastChannelByServer[s.id]) setActiveChannelId(lastChannelByServer[s.id])
                    setServerSearchOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded mb-1 ${activeServerId === s.id ? 'bg-[#5865f2]' : 'bg-[#2b2d31] hover:bg-[#3a3d44]'}`}
                >
                  <span className="inline-flex w-7 mr-2 justify-center text-xs rounded bg-[#111214] py-1">{serverGlyph(s.name)}</span>
                  {s.name}
                </button>
              ))}
              {!serverSearchResults.length && <div className="text-sm text-[#949ba4] px-3 py-2">Серверы не найдены</div>}
            </div>
            <div className="border-t border-[#3f4147] p-3">
              <button
                onClick={() => setInviteJoinOpen((v) => !v)}
                className="w-full rounded-lg bg-[#2b2d31] hover:bg-[#3a3d44] px-3 py-2 text-sm text-left"
              >
                {inviteJoinOpen ? 'Скрыть ввод инвайт-кода' : 'Ввести инвайт код'}
              </button>
              {inviteJoinOpen && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void joinByInvite() }}
                    placeholder="Введите invite code"
                    className="flex-1 rounded-lg bg-[#2b2d31] border border-[#3f4147] px-3 py-2 text-sm outline-none"
                  />
                  <button
                    onClick={() => void joinByInvite()}
                    className="rounded-lg bg-[#5865f2] hover:bg-[#4752c4] px-3 py-2 text-sm"
                  >
                    Войти
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  )
}
