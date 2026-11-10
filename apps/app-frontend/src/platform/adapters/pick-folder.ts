import { open } from '@tauri-apps/plugin-dialog'

/** Opens the system folder picker. Returns the chosen folder, or null if cancelled. */
export async function pickFolder(title: string): Promise<string | null> {
	const picked = await open({ directory: true, multiple: false, title })
	return typeof picked === 'string' ? picked : null
}
