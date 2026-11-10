/**
 * Settings sync through the 3ellwa Space account (replaces Modrinth's user preferences).
 * Server stores one JSON document under the key "settings" with optimistic versioning.
 */
import type { UserPreferencesContext } from '@modrinth/ui'

import { get as getSettings } from '@/helpers/settings.ts'
import { spaceRequest } from '@/helpers/space_account.ts'

type UserPreferences = NonNullable<UserPreferencesContext['preferences']['value']>
type PartialUserPreferences = Parameters<UserPreferencesContext['updatePreferences']>[0]

type Stored = { value: UserPreferences | null; version: number }

async function fetchStored(): Promise<Stored> {
	const reply = await spaceRequest('GET', '/api/sync/settings')
	if (reply.status !== 200) throw new Error(`Could not load synced settings (${reply.status})`)
	const data = JSON.parse(reply.body)
	return { value: data.value ?? null, version: data.version ?? 0 }
}

/** First sync: build the cloud copy from what this PC already uses. */
async function defaultsFromLocal(): Promise<UserPreferences> {
	const s = await getSettings()
	const dark = s.theme === 'light' ? 'dark' : s.theme === 'system' ? 'dark' : s.theme
	return {
		appearance: { auto: s.theme === 'system', theme: dark as 'dark' | 'oled' | 'retro' },
		behavior: {
			minimize_app: s.hide_on_process_start,
			refocus_on_game_close: s.refocus_on_game_close,
			hide_right_sidebar: s.toggle_sidebar,
			show_jump_in: s.show_jump_in,
			compact_instance_cards: s.compact_instance_cards,
			show_play_time: s.show_play_time,
			hide_nametag: s.hide_nametag_skins_page,
			show_all_screenshots: false,
			show_files_tab_in_instances: s.show_files_tab_in_instances,
			show_worlds_tab_in_instances: s.show_worlds_tab_in_instances,
			show_screenshots_tab_in_instances: s.show_screenshots_tab_in_instances,
			show_skin_selector_in_sidebar: s.show_skin_selector_in_sidebar,
			quick_instance_count: 5,
			warn_on_unknown_modpacks: s.warn_on_unknown_modpacks,
			skip_non_essential_warnings: s.skip_non_essential_warnings,
		},
		localization: { locale: s.locale },
		layouts: {
			mods: 'rows',
			plugins: 'rows',
			datapacks: 'rows',
			shaders: 'rows',
			resourcepacks: 'rows',
			modpacks: 'rows',
			servers: 'rows',
			users: 'rows',
		},
		sidebars: { right_aligned_search: false, left_aligned_content: false },
		social: {
			friend_privacy: 'none',
			shared_instances_privacy: 'none',
			hosting_access_privacy: 'none',
		},
	} as UserPreferences
}

function merge(base: UserPreferences, patch: PartialUserPreferences): UserPreferences {
	const out: Record<string, unknown> = { ...base }
	for (const [section, value] of Object.entries(patch ?? {})) {
		out[section] = { ...((base as Record<string, object>)[section] ?? {}), ...(value ?? {}) }
	}
	return out as UserPreferences
}

export async function get_space_preferences(): Promise<UserPreferences> {
	const stored = await fetchStored()
	if (stored.value) return stored.value
	const initial = await defaultsFromLocal()
	const reply = await spaceRequest('PUT', '/api/sync/settings', { value: initial, baseVersion: 0 })
	if (reply.status !== 200 && reply.status !== 409) {
		throw new Error(`Could not save settings to your 3ellwa account (${reply.status})`)
	}
	return reply.status === 409 ? ((await fetchStored()).value ?? initial) : initial
}

export async function patch_space_preferences(
	patch: PartialUserPreferences,
): Promise<UserPreferences> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const stored = await fetchStored()
		const next = merge(stored.value ?? (await defaultsFromLocal()), patch)
		const reply = await spaceRequest('PUT', '/api/sync/settings', {
			value: next,
			baseVersion: stored.version,
		})
		if (reply.status === 200) return next
		if (reply.status !== 409) {
			throw new Error(`Could not save settings to your 3ellwa account (${reply.status})`)
		}
	}
	throw new Error('Your settings changed on another device. Please try again.')
}
