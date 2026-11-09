/** 3ellwa Space account (optional, Discord sign-in through https://3ellwa.space). */
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'

export type SpaceUser = {
	id: string
	discordId?: string
	username?: string
	avatarUrl?: string | null
}

export type SpaceAccount = { user: SpaceUser }

/** Shared across the whole app so the checklist and Settings always agree. */
export const spaceAccount = ref<SpaceAccount | null>(null)
export const spaceAccountReady = ref(false)
export const spaceSigningIn = ref(false)

export function spaceUserName(account: SpaceAccount | null): string {
	const u = account?.user
	return String(u?.username ?? 'Signed in')
}

export async function refreshSpaceAccount(): Promise<void> {
	try {
		spaceAccount.value = await invoke<SpaceAccount | null>('plugin:space-account|space_account_get')
	} catch {
		spaceAccount.value = null
	}
	spaceAccountReady.value = true
}

export async function spaceSignIn(): Promise<void> {
	spaceSigningIn.value = true
	try {
		spaceAccount.value = await invoke<SpaceAccount>('plugin:space-account|space_account_sign_in')
	} finally {
		spaceSigningIn.value = false
	}
}

export async function spaceSignOut(): Promise<void> {
	await invoke('plugin:space-account|space_account_sign_out')
	spaceAccount.value = null
}

export type SpaceReply = { status: number; body: string }

/** Authenticated call to the 3ellwa.space API (the token stays in the Rust side). */
export async function spaceRequest(
	method: 'GET' | 'PUT' | 'POST' | 'DELETE',
	path: string,
	body?: unknown,
): Promise<SpaceReply> {
	const reply = await invoke<SpaceReply>('plugin:space-account|space_account_request', {
		method,
		path,
		body: body === undefined ? null : JSON.stringify(body),
	})
	if (reply.status === 401) {
		spaceAccount.value = null
	}
	return reply
}
