<script setup lang="ts">
import {
	ArchiveIcon,
	CheckIcon,
	HistoryIcon,
	SpinnerIcon,
	TrashIcon,
	XIcon,
} from '@modrinth/assets'
import {
	Button,
	commonMessages,
	defineMessages,
	injectNotificationManager,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import { getWorldDisplayName, type SingleplayerWorld } from '@/helpers/worlds'
import {
	createWorldBackup,
	deleteWorldBackup,
	listWorldBackups,
	restoreWorldBackup,
	type WorldBackup,
} from '@/platform/app-lib/world-backups/commands'

import { useLauncherPrefs } from './use-launcher-prefs'

const props = defineProps<{
	instanceId: string
	gameRunning: boolean
}>()

const emit = defineEmits<{
	restored: []
}>()

const { formatMessage } = useVIntl()
const { addNotification, handleError } = injectNotificationManager()
const { prefs, ready } = useLauncherPrefs()

const messages = defineMessages({
	title: { id: 'app.world-backups.modal.title', defaultMessage: 'Backups of {name}' },
	empty: {
		id: 'app.world-backups.modal.empty',
		defaultMessage:
			'No backups yet. Back up now, or one is made automatically before you update mods.',
	},
	backUpNow: { id: 'app.world-backups.modal.back-up-now', defaultMessage: 'Back up now' },
	restore: { id: 'app.world-backups.modal.restore', defaultMessage: 'Restore' },
	confirmRestore: {
		id: 'app.world-backups.modal.confirm-restore',
		defaultMessage: 'Yes, restore',
	},
	automatic: { id: 'app.world-backups.modal.automatic', defaultMessage: 'Automatic' },
	manual: { id: 'app.world-backups.modal.manual', defaultMessage: 'Manual' },
	restoreNote: {
		id: 'app.world-backups.modal.restore-note',
		defaultMessage:
			'Restoring replaces the world with the backup. Your current world is backed up first, so you can always undo.',
	},
	gameRunning: {
		id: 'app.world-backups.modal.game-running',
		defaultMessage: 'Close the game to back up or restore worlds.',
	},
	restoredTitle: { id: 'app.world-backups.modal.restored-title', defaultMessage: 'World restored' },
	restoredText: {
		id: 'app.world-backups.modal.restored-text',
		defaultMessage: '{name} is back to {date}. The version you replaced was saved as a backup.',
	},
	backedUpTitle: { id: 'app.world-backups.modal.backed-up-title', defaultMessage: 'Backup saved' },
})

const modal = ref<InstanceType<typeof NewModal>>()
const world = ref<SingleplayerWorld | null>(null)
const backups = ref<WorldBackup[]>([])
const loading = ref(false)
const busy = ref<string | null>(null)
const confirming = ref<string | null>(null)

const worldName = computed(() => (world.value ? getWorldDisplayName(world.value) : ''))

const formatDate = (unix: number) =>
	new Date(unix * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const formatSize = (bytes: number) =>
	bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`

async function load() {
	if (!world.value) return
	loading.value = true
	try {
		await ready()
		const all = await listWorldBackups(props.instanceId, prefs.value.worldBackups.folder)
		backups.value = all.filter((backup) => backup.world === world.value?.path)
	} catch (error) {
		handleError(error as Error)
	} finally {
		loading.value = false
	}
}

async function show(target: SingleplayerWorld) {
	world.value = target
	confirming.value = null
	backups.value = []
	modal.value?.show()
	await load()
}

async function backUpNow() {
	if (!world.value) return
	busy.value = 'new'
	try {
		await createWorldBackup(
			props.instanceId,
			world.value.path,
			false,
			prefs.value.worldBackups.folder,
		)
		addNotification({ title: formatMessage(messages.backedUpTitle), type: 'success' })
		await load()
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

async function restore(backup: WorldBackup) {
	if (confirming.value !== backup.file_name) {
		confirming.value = backup.file_name
		return
	}
	confirming.value = null
	busy.value = backup.file_name
	try {
		await restoreWorldBackup(props.instanceId, backup.file_name, prefs.value.worldBackups.folder)
		addNotification({
			title: formatMessage(messages.restoredTitle),
			text: formatMessage(messages.restoredText, {
				name: worldName.value,
				date: formatDate(backup.created),
			}),
			type: 'success',
		})
		emit('restored')
		await load()
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

async function remove(backup: WorldBackup) {
	busy.value = backup.file_name
	try {
		await deleteWorldBackup(props.instanceId, backup.file_name, prefs.value.worldBackups.folder)
		backups.value = backups.value.filter((b) => b.file_name !== backup.file_name)
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

defineExpose({ show })
</script>

<template>
	<NewModal
		ref="modal"
		:header="formatMessage(messages.title, { name: worldName })"
		max-width="600px"
	>
		<div class="flex flex-col gap-4">
			<p class="m-0 text-secondary">
				{{ formatMessage(gameRunning ? messages.gameRunning : messages.restoreNote) }}
			</p>
			<div v-if="loading" class="flex justify-center py-6">
				<SpinnerIcon class="size-6 animate-spin" />
			</div>
			<p v-else-if="!backups.length" class="m-0 py-4 text-center text-secondary">
				{{ formatMessage(messages.empty) }}
			</p>
			<ul v-else class="m-0 flex max-h-[24rem] list-none flex-col gap-2 overflow-y-auto p-0">
				<li
					v-for="backup in backups"
					:key="backup.file_name"
					class="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3"
				>
					<ArchiveIcon class="size-5 shrink-0 text-secondary" aria-hidden="true" />
					<div class="flex min-w-0 grow flex-col">
						<span class="font-semibold text-contrast">{{ formatDate(backup.created) }}</span>
						<span class="text-sm text-secondary">
							{{ formatSize(backup.size) }} ·
							{{ formatMessage(backup.auto ? messages.automatic : messages.manual) }}
						</span>
					</div>
					<Button
						:type="confirming === backup.file_name ? 'colored' : 'outlined'"
						:color="confirming === backup.file_name ? 'orange' : undefined"
						size="sm"
						:disabled="gameRunning || !!busy"
						@click="restore(backup)"
					>
						<SpinnerIcon v-if="busy === backup.file_name" class="animate-spin" />
						<HistoryIcon v-else />
						{{
							formatMessage(
								confirming === backup.file_name ? messages.confirmRestore : messages.restore,
							)
						}}
					</Button>
					<Button
						type="quiet"
						size="sm"
						icon-only
						:disabled="!!busy"
						:aria-label="formatMessage(commonMessages.deleteLabel)"
						@click="remove(backup)"
					>
						<TrashIcon />
					</Button>
				</li>
			</ul>
		</div>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button type="outlined" @click="modal?.hide()">
					<XIcon />
					{{ formatMessage(commonMessages.closeButton) }}
				</Button>
				<Button type="colored" color="brand" :disabled="gameRunning || !!busy" @click="backUpNow">
					<SpinnerIcon v-if="busy === 'new'" class="animate-spin" />
					<CheckIcon v-else />
					{{ formatMessage(messages.backUpNow) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>
