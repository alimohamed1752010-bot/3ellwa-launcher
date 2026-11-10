import { invoke } from '@tauri-apps/api/core'

/** 3ellwa Space preferences kept in `3ellwa-launcher-prefs.json` in the app data folder. */
export type LauncherPrefs = {
	worldBackups: {
		/** Back up every singleplayer world before mods or a modpack are updated. */
		autoBeforeUpdates: boolean
		/** Automatic backups kept per world; older ones are deleted. */
		keep: number
		/** The player's own folder (for example a OneDrive folder), or null for `<instance>/backups`. */
		folder: string | null
	}
}

export const DEFAULT_LAUNCHER_PREFS: LauncherPrefs = {
	worldBackups: { autoBeforeUpdates: true, keep: 5, folder: null },
}

export async function getLauncherPrefs(): Promise<LauncherPrefs> {
	try {
		const raw = await invoke<string | null>('plugin:space-account|space_store_get', {
			name: 'launcher-prefs',
		})
		const stored = raw ? (JSON.parse(raw) as Partial<LauncherPrefs>) : {}
		return {
			...DEFAULT_LAUNCHER_PREFS,
			...stored,
			worldBackups: { ...DEFAULT_LAUNCHER_PREFS.worldBackups, ...stored.worldBackups },
		}
	} catch {
		return structuredClone(DEFAULT_LAUNCHER_PREFS)
	}
}

export function setLauncherPrefs(prefs: LauncherPrefs): Promise<void> {
	return invoke('plugin:space-account|space_store_set', {
		name: 'launcher-prefs',
		value: JSON.stringify(prefs),
	})
}
