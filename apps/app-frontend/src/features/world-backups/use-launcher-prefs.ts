import { ref } from 'vue'

import {
	DEFAULT_LAUNCHER_PREFS,
	getLauncherPrefs,
	type LauncherPrefs,
	setLauncherPrefs,
} from '@/platform/app-lib/launcher-prefs/commands'

const prefs = ref<LauncherPrefs>(structuredClone(DEFAULT_LAUNCHER_PREFS))
let loading: Promise<LauncherPrefs> | null = null

/** Shared 3ellwa Space preferences, loaded once from the app data folder. */
export function useLauncherPrefs() {
	if (!loading) {
		loading = getLauncherPrefs().then((loaded) => {
			prefs.value = loaded
			return loaded
		})
	}

	async function update(change: (draft: LauncherPrefs) => void) {
		await loading
		// prefs.value is a reactive proxy, which structuredClone cannot copy
		const next = JSON.parse(JSON.stringify(prefs.value)) as LauncherPrefs
		change(next)
		prefs.value = next
		await setLauncherPrefs(next)
	}

	return { prefs, ready: () => loading!, update }
}
