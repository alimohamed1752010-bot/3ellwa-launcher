/**
 * 3ellwa Space cloud features: instance sync + restore, shared setups, skins sync, friends, presence.
 * Everything goes through the signed-in 3ellwa account (spaceRequest keeps the token in Rust).
 */
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'

import type { AppEvents } from '@/providers/app-events'

import { install_create_instance, wait_for_install_job } from './install'
import { add_project_from_version, get_content_items, list as listInstances } from './instance'
import { get_all as getRunning } from './process.js'
import {
	add_and_equip_custom_skin,
	equip_skin,
	get_available_skins,
	normalize_skin_texture,
	type Skin,
} from './skins'
import { spaceAccount, spaceRequest } from './space_account'
import type { GameInstance } from './types'

// ---------------------------------------------------------------- shared state for the UI
export type ModEntry = { p: string; v: string; f: string; t: string; on: boolean }
export type Manifest = {
	name: string
	game_version: string
	loader: string
	loader_version: string | null
	mods: ModEntry[]
	external: number
	updated: number
}
export type CloudInstance = Manifest & { syncId: string }
export type Friend = {
	id: number
	username: string
	avatarUrl: string | null
	online?: boolean
	playing?: string | null
}
export type FriendsState = { friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }
export type SharedSetup = { code: string; name: string; created_at: number }

export const cloudInstances = ref<CloudInstance[]>([])
export const cloudSkinCount = ref(0)
export const friendsState = ref<FriendsState>({ friends: [], incoming: [], outgoing: [] })
export const mySharedSetups = ref<SharedSetup[]>([])
export const cloudStatus = ref<{ busy: boolean; last: number | null; error: string | null }>({
	busy: false,
	last: null,
	error: null,
})

let appEvents: AppEvents | null = null
const MAP_KEY = 'space-instance-map-v1'

type MapState = { local: Record<string, string>; hash: Record<string, string> }
// The id map lives in a file in the app data folder (shared by every build of the app),
// with web storage only as a one-time fallback for older versions.
async function loadMap(): Promise<MapState> {
	try {
		const raw = await invoke<string | null>('plugin:space-account|space_store_get', {
			name: 'instance-map',
		})
		if (raw) return JSON.parse(raw) as MapState
	} catch {
		// fall through
	}
	try {
		const legacy = window.localStorage.getItem(MAP_KEY)
		if (legacy) return JSON.parse(legacy) as MapState
	} catch {
		// ignore
	}
	return { local: {}, hash: {} }
}
async function saveMap(m: MapState): Promise<void> {
	await invoke('plugin:space-account|space_store_set', {
		name: 'instance-map',
		value: JSON.stringify(m),
	})
}

function hashString(s: string): string {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
	return String(h >>> 0)
}
const uuid = () =>
	'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
	})

async function getDoc<T>(key: string): Promise<{ value: T | null; version: number }> {
	const reply = await spaceRequest('GET', `/api/sync/${key}`)
	if (reply.status !== 200)
		throw new Error(`Could not load ${key} from your account (${reply.status})`)
	const data = JSON.parse(reply.body)
	return { value: (data.value ?? null) as T | null, version: data.version ?? 0 }
}
async function putDoc(key: string, value: unknown, baseVersion: number): Promise<boolean> {
	const reply = await spaceRequest('PUT', `/api/sync/${key}`, { value, baseVersion })
	if (reply.status === 200) return true
	if (reply.status === 409) return false
	throw new Error(`Could not save ${key} to your account (${reply.status})`)
}

// ---------------------------------------------------------------- instances
type InstancesDoc = {
	items: Record<string, Manifest>
	deleted: Record<string, number>
}

function isInstalled(i: GameInstance) {
	return i.install_stage === 'installed' || i.install_stage === 'pack_installed'
}

export async function buildManifest(inst: GameInstance): Promise<Manifest> {
	const items = await get_content_items(inst.id).catch(() => [])
	const mods: ModEntry[] = []
	let external = 0
	type LooseContentItem = {
		project?: { id?: string }
		version?: { id?: string }
		external?: boolean
		file_name?: string
		project_type?: string
		projectType?: string
		enabled?: boolean
		disabled?: boolean
	}
	for (const it of items as unknown as LooseContentItem[]) {
		const pid = it.project?.id
		const vid = it.version?.id
		if (!pid || !vid || it.external) {
			external++
			continue
		}
		mods.push({
			p: String(pid),
			v: String(vid),
			f: String(it.file_name ?? ''),
			t: String(it.project_type ?? it.projectType ?? 'mod'),
			on: it.enabled !== false && it.disabled !== true,
		})
	}
	mods.sort((a, b) => a.p.localeCompare(b.p))
	return {
		name: inst.name,
		game_version: inst.game_version,
		loader: inst.loader,
		loader_version: inst.loader_version ?? null,
		mods,
		external,
		updated: Date.now(),
	}
}

const manifestHash = (m: Manifest) => hashString(JSON.stringify({ ...m, updated: 0 }))

let syncing: Promise<void> | null = null

/** One full pass: push changed local instances up, refresh the "restore" list. */
export function syncInstances(): Promise<void> {
	if (syncing) return syncing
	syncing = (async () => {
		if (!spaceAccount.value) return
		cloudStatus.value = { ...cloudStatus.value, busy: true, error: null }
		try {
			const local = (await listInstances()).filter(isInstalled)
			const map = await loadMap()
			const manifests = new Map<string, { syncId: string; m: Manifest; localId: string }>()
			for (const inst of local) {
				let syncId = map.local[inst.id]
				if (!syncId) {
					syncId = uuid()
					map.local[inst.id] = syncId
				}
				manifests.set(syncId, { syncId, m: await buildManifest(inst), localId: inst.id })
			}

			for (let attempt = 0; attempt < 3; attempt++) {
				const { value, version } = await getDoc<InstancesDoc>('instances')
				const doc: InstancesDoc = value ?? { items: {}, deleted: {} }
				doc.items ??= {}
				doc.deleted ??= {}
				let changed = false

				for (const { syncId, m } of manifests.values()) {
					if (doc.deleted[syncId]) continue // removed on another PC: leave the local copy alone
					const h = manifestHash(m)
					if (!doc.items[syncId] || map.hash[syncId] !== h) {
						if (!doc.items[syncId] || manifestHash(doc.items[syncId]) !== h) {
							doc.items[syncId] = m
							changed = true
						}
						map.hash[syncId] = h
					}
				}
				// instances this PC used to have that were deleted here
				for (const [localId, syncId] of Object.entries(map.local)) {
					if (!local.some((i) => i.id === localId)) {
						if (doc.items[syncId]) {
							Reflect.deleteProperty(doc.items, syncId)
							doc.deleted[syncId] = Date.now()
							changed = true
						}
						Reflect.deleteProperty(map.local, localId)
						Reflect.deleteProperty(map.hash, syncId)
					}
				}

				if (!changed || (await putDoc('instances', doc, version))) {
					const have = new Set(Object.values(map.local))
					cloudInstances.value = Object.entries(doc.items)
						.filter(([id]) => !have.has(id) && !doc.deleted[id])
						.map(([syncId, m]) => ({ syncId, ...m }))
						.sort((a, b) => a.name.localeCompare(b.name))
					await saveMap(map)
					cloudStatus.value = { busy: false, last: Date.now(), error: null }
					return
				}
			}
			throw new Error('Your instances changed on another PC. Will retry shortly.')
		} catch (e) {
			cloudStatus.value = {
				busy: false,
				last: cloudStatus.value.last,
				error: String((e as Error)?.message ?? e),
			}
		} finally {
			syncing = null
		}
	})()
	return syncing
}

export type RestoreResult = { name: string; installed: number; failed: string[] }

async function createFromManifest(m: Manifest, syncId: string | null): Promise<RestoreResult> {
	if (!appEvents) throw new Error('App is still starting, try again in a moment.')
	const existing = (await listInstances()).map((i) => i.name)
	let name = m.name
	if (existing.includes(name)) name = `${m.name} (restored)`
	let n = 2
	while (existing.includes(name)) name = `${m.name} (restored ${n++})`

	const job = await install_create_instance({
		name,
		gameVersion: m.game_version,
		loader: m.loader as never,
		loaderVersion: m.loader_version,
		iconPath: null,
	})
	const done = await wait_for_install_job(appEvents, job.job_id)
	const instanceId = done.instance_id ?? job.instance_id
	if (!instanceId) throw new Error('The instance was created but its id was not returned.')

	let installed = 0
	const failed: string[] = []
	for (const mod of m.mods) {
		if (mod.t === 'modpack') continue
		try {
			await add_project_from_version(instanceId, mod.v, 'standalone')
			installed++
		} catch {
			failed.push(mod.f || mod.p)
		}
	}
	if (syncId) {
		const map = await loadMap()
		map.local[instanceId] = syncId
		const fresh = (await listInstances()).find((i) => i.id === instanceId)
		if (fresh) map.hash[syncId] = manifestHash(await buildManifest(fresh))
		await saveMap(map)
	}
	return { name, installed, failed }
}

export async function restoreCloudInstance(syncId: string): Promise<RestoreResult> {
	const item = cloudInstances.value.find((c) => c.syncId === syncId)
	if (!item) throw new Error('That instance is no longer in your account.')
	const result = await createFromManifest(item, syncId)
	await syncInstances()
	return result
}

export async function forgetCloudInstance(syncId: string): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const { value, version } = await getDoc<InstancesDoc>('instances')
		const doc: InstancesDoc = value ?? { items: {}, deleted: {} }
		doc.items ??= {}
		doc.deleted ??= {}
		Reflect.deleteProperty(doc.items, syncId)
		doc.deleted[syncId] = Date.now()
		if (await putDoc('instances', doc, version)) break
	}
	cloudInstances.value = cloudInstances.value.filter((c) => c.syncId !== syncId)
}

// ---------------------------------------------------------------- shared setups
export async function shareInstance(localId: string): Promise<{ code: string; link: string }> {
	const inst = (await listInstances()).find((i) => i.id === localId)
	if (!inst) throw new Error('Instance not found.')
	const manifest = await buildManifest(inst)
	const reply = await spaceRequest('POST', '/api/shared', { name: inst.name, manifest })
	const data = JSON.parse(reply.body || '{}')
	if (reply.status !== 200) throw new Error(data.error ?? `Sharing failed (${reply.status})`)
	await refreshMyShares()
	return data
}

export async function refreshMyShares(): Promise<void> {
	const reply = await spaceRequest('GET', '/api/shared')
	if (reply.status === 200) mySharedSetups.value = JSON.parse(reply.body).shared ?? []
}

export async function deleteMyShare(code: string): Promise<void> {
	await spaceRequest('DELETE', `/api/shared/${encodeURIComponent(code)}`)
	await refreshMyShares()
}

export async function importShared(codeOrLink: string): Promise<RestoreResult> {
	const code = codeOrLink.trim().split('/').pop() ?? ''
	if (!/^[A-Za-z0-9]{6,32}$/.test(code)) throw new Error('That does not look like a share code.')
	const reply = await spaceRequest('GET', `/api/shared/${code}`)
	const data = JSON.parse(reply.body || '{}')
	if (reply.status !== 200)
		throw new Error(data.error ?? `Could not find that setup (${reply.status})`)
	const result = await createFromManifest(data.manifest as Manifest, null)
	await syncInstances()
	return result
}

// ---------------------------------------------------------------- skins
type SkinsDoc = { skins: Record<string, { name?: string; variant: string; png: string }> }

function b64(bytes: Uint8Array): string {
	let s = ''
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

let localSkinKeys = new Set<string>()
let cloudSkins: SkinsDoc['skins'] = {}

export async function syncSkins(): Promise<void> {
	if (!spaceAccount.value) return
	try {
		const all = await get_available_skins()
		const custom = all.filter((s) => s.source === 'custom')
		localSkinKeys = new Set(all.map((s) => s.texture_key))
		for (let attempt = 0; attempt < 3; attempt++) {
			const { value, version } = await getDoc<SkinsDoc>('skins')
			const doc: SkinsDoc = value ?? { skins: {} }
			doc.skins ??= {}
			let changed = false
			for (const s of custom) {
				if (doc.skins[s.texture_key]) continue
				const bytes = await normalize_skin_texture(s.texture)
				doc.skins[s.texture_key] = { name: s.name, variant: s.variant, png: b64(bytes) }
				changed = true
			}
			if (!changed || (await putDoc('skins', doc, version))) {
				cloudSkins = doc.skins
				cloudSkinCount.value = Object.keys(doc.skins).filter((k) => !localSkinKeys.has(k)).length
				return
			}
		}
	} catch {
		// skins need a Minecraft account; stay quiet when there is none
	}
}

export async function restoreCloudSkins(): Promise<number> {
	const before = (await get_available_skins()).find((s: Skin) => s.is_equipped) ?? null
	let n = 0
	for (const [key, s] of Object.entries(cloudSkins)) {
		if (localSkinKeys.has(key)) continue
		await add_and_equip_custom_skin(unb64(s.png), (s.variant as never) ?? 'CLASSIC')
		n++
	}
	if (before) await equip_skin(before).catch(() => undefined)
	await syncSkins()
	return n
}

// ---------------------------------------------------------------- friends + presence
export async function refreshFriends(): Promise<void> {
	if (!spaceAccount.value) return
	const reply = await spaceRequest('GET', '/api/friends')
	if (reply.status === 200) friendsState.value = JSON.parse(reply.body)
}

export async function requestFriend(username: string): Promise<string> {
	const reply = await spaceRequest('POST', '/api/friends/request', { username })
	const data = JSON.parse(reply.body || '{}')
	if (reply.status !== 200)
		throw new Error(data.error ?? `Could not send the request (${reply.status})`)
	await refreshFriends()
	return data.status as string
}

export async function respondFriend(id: number, accept: boolean): Promise<void> {
	await spaceRequest('POST', '/api/friends/respond', { id, accept })
	await refreshFriends()
}

export async function removeFriend(id: number): Promise<void> {
	await spaceRequest('DELETE', `/api/friends/${id}`)
	await refreshFriends()
}

async function heartbeat() {
	if (!spaceAccount.value) return
	let playing: string | null = null
	try {
		const running = (await getRunning()) as Array<{ instance_name?: string }>
		playing = running?.[0]?.instance_name ?? null
	} catch {
		// ignore
	}
	await spaceRequest('PUT', '/api/presence', { playing }).catch(() => undefined)
}

// ---------------------------------------------------------------- start everything
let started = false
export function startSpaceCloud(events: AppEvents) {
	appEvents = events
	if (started) return
	started = true
	const tick = async () => {
		if (!spaceAccount.value) return
		await syncInstances()
		await syncSkins()
	}
	setTimeout(tick, 15_000)
	setInterval(tick, 5 * 60_000)
	setTimeout(() => void refreshFriends().then(heartbeat), 5_000)
	setInterval(() => void refreshFriends(), 60_000)
	setInterval(() => void heartbeat(), 60_000)
}
