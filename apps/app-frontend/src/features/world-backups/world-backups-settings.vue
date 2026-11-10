<script setup lang="ts">
import { FolderSearchIcon, XIcon } from '@modrinth/assets'
import { Button, defineMessages, injectNotificationManager, Toggle, useVIntl } from '@modrinth/ui'

import { pickFolder } from '@/platform/adapters/pick-folder'

import { useLauncherPrefs } from './use-launcher-prefs'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { prefs, update } = useLauncherPrefs()

const KEEP_OPTIONS = [3, 5, 10, 20]

const messages = defineMessages({
	autoTitle: {
		id: 'app.settings.world-backups.auto.title',
		defaultMessage: 'Back up worlds before updates',
	},
	autoDescription: {
		id: 'app.settings.world-backups.auto.description',
		defaultMessage:
			'Before mods or a modpack are updated, every singleplayer world in that instance is saved as a backup. Restore from the Worlds tab, under a world’s menu.',
	},
	keepTitle: {
		id: 'app.settings.world-backups.keep.title',
		defaultMessage: 'Automatic backups to keep',
	},
	keepDescription: {
		id: 'app.settings.world-backups.keep.description',
		defaultMessage:
			'Per world. Older automatic backups are deleted. Backups you make yourself are never deleted.',
	},
	folderTitle: { id: 'app.settings.world-backups.folder.title', defaultMessage: 'Backup folder' },
	folderDescription: {
		id: 'app.settings.world-backups.folder.description',
		defaultMessage:
			'Backups stay on this computer. Pick a folder inside OneDrive, Google Drive or Dropbox to also keep a copy in your own cloud.',
	},
	folderDefault: {
		id: 'app.settings.world-backups.folder.default',
		defaultMessage: 'Default: the backups folder inside each instance',
	},
	chooseFolder: { id: 'app.settings.world-backups.folder.choose', defaultMessage: 'Choose folder' },
	useDefault: {
		id: 'app.settings.world-backups.folder.use-default',
		defaultMessage: 'Use default',
	},
})

function save(change: Parameters<typeof update>[0]) {
	update(change).catch((error) => handleError(error as Error))
}

async function chooseFolder() {
	const folder = await pickFolder(formatMessage(messages.folderTitle)).catch(() => null)
	if (folder) save((draft) => (draft.worldBackups.folder = folder))
}
</script>

<template>
	<section class="flex flex-col gap-6">
		<div class="flex items-center justify-between gap-4">
			<div>
				<h2 id="world-backups-auto-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.autoTitle) }}
				</h2>
				<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.autoDescription) }}</p>
			</div>
			<Toggle
				id="world-backups-auto"
				aria-labelledby="world-backups-auto-label"
				:model-value="prefs.worldBackups.autoBeforeUpdates"
				@update:model-value="
					(value) => save((draft) => (draft.worldBackups.autoBeforeUpdates = !!value))
				"
			/>
		</div>

		<div class="flex items-center justify-between gap-4">
			<div>
				<h2 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.keepTitle) }}
				</h2>
				<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.keepDescription) }}</p>
			</div>
			<div class="flex shrink-0 gap-1">
				<Button
					v-for="count in KEEP_OPTIONS"
					:key="count"
					size="sm"
					:type="prefs.worldBackups.keep === count ? 'colored' : 'outlined'"
					:color="prefs.worldBackups.keep === count ? 'brand' : undefined"
					@click="save((draft) => (draft.worldBackups.keep = count))"
				>
					{{ count }}
				</Button>
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<div>
				<h2 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.folderTitle) }}
				</h2>
				<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.folderDescription) }}</p>
			</div>
			<code
				class="w-fit max-w-full break-all rounded-lg bg-surface-2 px-3 py-2 text-sm text-contrast"
			>
				{{ prefs.worldBackups.folder ?? formatMessage(messages.folderDefault) }}
			</code>
			<div class="flex gap-2">
				<Button type="outlined" @click="chooseFolder">
					<FolderSearchIcon />
					{{ formatMessage(messages.chooseFolder) }}
				</Button>
				<Button
					v-if="prefs.worldBackups.folder"
					type="quiet"
					@click="save((draft) => (draft.worldBackups.folder = null))"
				>
					<XIcon />
					{{ formatMessage(messages.useDefault) }}
				</Button>
			</div>
		</div>
	</section>
</template>
