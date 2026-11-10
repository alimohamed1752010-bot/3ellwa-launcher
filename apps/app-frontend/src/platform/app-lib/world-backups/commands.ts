import { invoke } from '@tauri-apps/api/core'

export type WorldBackup = {
	file_name: string
	/** Folder name of the world inside `saves/`. */
	world: string
	/** Unix seconds. */
	created: number
	size: number
	/** Made automatically before an update; only these are pruned. */
	auto: boolean
}

/** `backupsRoot` is the player's own backup folder, or null for `<instance>/backups`. */
export function createWorldBackup(
	instance: string,
	world: string,
	auto: boolean,
	backupsRoot: string | null,
): Promise<WorldBackup> {
	return invoke('plugin:worlds|world_backup_create', { instance, world, auto, backupsRoot })
}

export function listWorldBackups(
	instance: string,
	backupsRoot: string | null,
): Promise<WorldBackup[]> {
	return invoke('plugin:worlds|world_backup_list', { instance, backupsRoot })
}

/** Restores a backup over the current world. Returns the safety backup made of the old world. */
export function restoreWorldBackup(
	instance: string,
	fileName: string,
	backupsRoot: string | null,
): Promise<WorldBackup | null> {
	return invoke('plugin:worlds|world_backup_restore', { instance, fileName, backupsRoot })
}

export function deleteWorldBackup(
	instance: string,
	fileName: string,
	backupsRoot: string | null,
): Promise<void> {
	return invoke('plugin:worlds|world_backup_delete', { instance, fileName, backupsRoot })
}

export function pruneWorldBackups(
	instance: string,
	world: string,
	keep: number,
	backupsRoot: string | null,
): Promise<number> {
	return invoke('plugin:worlds|world_backup_prune', { instance, world, keep, backupsRoot })
}
