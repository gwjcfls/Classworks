// Cloudflare Workers compatible real-time adapter.
// The UI-facing API stays compatible with the former Socket.IO client.

import { getSetting } from '@/utils/settings'

const POLL_INTERVAL_MS = 60 * 1000
const listeners = new Map()

let socket = null
let joinedToken = ''
let pollTimer = null
let pollCursor = Date.now()
let pollInFlight = false

function listenerSet(event) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  return listeners.get(event)
}

function dispatch(event, payload) {
  const handlers = listeners.get(event)
  if (!handlers) return
  handlers.forEach(handler => {
    try {
      handler(payload)
    } catch (error) {
      console.error(`实时事件 ${event} 处理失败`, error)
    }
  })
}

function authHeaders(token = joinedToken) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-app-token': token,
  }
}

export function getServerUrl() {
  return getSetting('server.domain') || window.location.origin
}

async function pollEvents() {
  if (!joinedToken || pollInFlight || document.visibilityState === 'hidden') return
  pollInFlight = true

  try {
    const response = await fetch(
      `${getServerUrl()}/api/events?since=${encodeURIComponent(pollCursor)}`,
      { headers: authHeaders() },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const payload = await response.json()
    const events = Array.isArray(payload.events) ? payload.events : []
    events.forEach(event => dispatch('device-event', event))
    pollCursor = Math.max(
      Number(payload.cursor) || Date.now(),
      ...events.map(event => Number(event.timestampMs) || 0),
    )

    if (!socket.connected) {
      socket.connected = true
      dispatch('connect')
    }
  } catch (error) {
    if (socket?.connected) {
      socket.connected = false
      dispatch('disconnect', 'polling error')
    }
    console.debug('云端实时轮询暂时不可用', error)
  } finally {
    pollInFlight = false
  }
}

function startPolling(token) {
  if (!token) return
  joinedToken = token
  pollCursor = Date.now() - POLL_INTERVAL_MS
  if (pollTimer) clearInterval(pollTimer)
  pollEvents()
  pollTimer = setInterval(pollEvents, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  joinedToken = ''
  if (socket) socket.connected = false
}

async function postEvent(type, content) {
  const token = joinedToken || getSetting('server.kvToken')
  if (!token) return

  try {
    const response = await fetch(`${getServerUrl()}/api/events`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ type, content }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    console.warn('发送云端实时事件失败', error)
  }
}

function createCompatSocket() {
  const ioListeners = new Map()
  const socketIo = {
    engine: {
      transport: { name: 'cloudflare-kv-polling' },
      on() {},
      off() {},
    },
    on(event, handler) {
      if (!ioListeners.has(event)) ioListeners.set(event, new Set())
      ioListeners.get(event).add(handler)
    },
    off(event, handler) {
      ioListeners.get(event)?.delete(handler)
    },
  }

  return {
    id: `cf-${globalThis.crypto.randomUUID()}`,
    connected: false,
    io: socketIo,
    on(event, handler) {
      listenerSet(event).add(handler)
      return this
    },
    off(event, handler) {
      listenerSet(event).delete(handler)
      return this
    },
    emit(event, payload) {
      if (event === 'join-token') {
        startPolling(payload?.token)
      } else if (event === 'leave-token' || event === 'leave-all') {
        stopPolling()
      } else if (event === 'send-event') {
        postEvent(payload?.type, payload?.content)
      }
      return this
    },
    disconnect() {
      stopPolling()
      dispatch('disconnect', 'client disconnect')
    },
  }
}

export function getSocket() {
  if (!socket) socket = createCompatSocket()
  const token = getSetting('server.kvToken')
  if (token && token !== joinedToken) startPolling(token)
  return socket
}

export function on(event, handler) {
  getSocket().on(event, handler)
  return () => off(event, handler)
}

export function off(event, handler) {
  socket?.off(event, handler)
}

export function joinToken(token) {
  getSocket().emit('join-token', { token })
}

export function leaveToken(token) {
  if (!token || token === joinedToken) getSocket().emit('leave-token', { token })
}

export function leaveAll() {
  getSocket().emit('leave-all')
}

export function onConnect(handler) {
  const current = getSocket()
  current.on('connect', handler)
  if (current.connected) Promise.resolve().then(handler)
  return () => current.off('connect', handler)
}

export function sendEvent(type, content = null) {
  getSocket().emit('send-event', { type, content })
}

export function disconnect() {
  socket?.disconnect()
  socket = null
  listeners.clear()
}
