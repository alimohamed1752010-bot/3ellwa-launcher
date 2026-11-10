import { defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'

import { get_instance_worlds } from '@/helpers/worlds'
import { createWorldBackup, pruneWorldBackups } from '@/platform/app-lib/world-backups/commands'

import { useLauncherPrefs } from './use-launcher-prefs'

const messages = defineMessages({
	backedUpTitle: {
		id: 'app.world-backups.auto.done-title',
		defaultMessage: 'Worlds backed up',
	},
	backedUpText: {
		id: 'app.world-backups.auto.done-text',
		defaultMessage:
			'Backed up {count, plural, one {# world} other {# worlds}} before updating. You can restore them from the Worlds tab.',
	},
	failedTitle: {
		id: 'app.world-backups.auto.failed-title',
		defaultMessage: 'Update cancelled',
	},
	failedText: {
		id: 'app.world-backups.auto.failed-text',
		defaultMessage:
			"Couldn't back up your worlds first ({error}). Close the game if it's open and try again, or turn off automatic backups in Settings.",
	},
})

/** Several single-mod updates in a row share one backup. */
const RECENT_MS = 10 * 60 * 1000
const lastBackup = new Map<string, number>()

/**
 * Returns a function to call before changing an instance's mods or modpack. It backs up every
 * singleplayer world (when turned on in settings) and returns false if the update should stop
 * because the backup failed.
 */
export function useBackupBeforeUpdate() {
	const { formatMessage } = useVIntl()
	const { addNotification } = injectNotificationManager()
	const { prefs, ready } = useLauncherPrefs()

	return async function backupBeforeUpdate(instanceId: string): Promise<boolean> {
		await ready()
		const settings = prefs.value.worldBackups
		if (!settings.autoBeforeUpdates) return true
		if (Date.now() - (lastBackup.get(instanceId) ?? 0) < RECENT_MS) return true

		try {
			const worlds = (await get_instance_worlds(instanceId)).filter(
				(world) => world.type === 'singleplayer',
			)
			for (const world of worlds) {
				await createWorldBackup(instanceId, world.path, true, settings.folder)
				await pruneWorldBackups(instanceId, world.path, settings.keep, settings.folder)
			}
			lastBackup.set(instanceId, Date.now())
			if (worlds.length) {
				addNotification({
					title: formatMessage(messages.backedUpTitle),
					text: formatMessage(messages.backedUpText, { count: worlds.length }),
					type: 'success',
				})
			}
			return true
		} catch (error) {
			addNotification({
				title: formatMessage(messages.failedTitle),
				text: formatMessage(messages.failedText, {
					error:
						error instanceof Error
							? error.message
							: String((error as { message?: string })?.message ?? error),
				}),
				type: 'error',
			})
			return false
		}
	}
}
