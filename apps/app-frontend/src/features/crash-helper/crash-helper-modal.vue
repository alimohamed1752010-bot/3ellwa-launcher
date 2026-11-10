<script setup lang="ts">
import {
	BugIcon,
	ClipboardCopyIcon,
	CpuIcon,
	FileTextIcon,
	MemoryStickIcon,
	PlayIcon,
	PowerOffIcon,
	SearchIcon,
	SpinnerIcon,
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
import { useRouter } from 'vue-router'

import { useAppEvent } from '@/composables/use-app-event'
import { edit, get, get_content_items, run, toggle_disable_project } from '@/helpers/instance'
import { get_max_memory } from '@/helpers/jre.js'
import { get_latest_log_cursor, get_logs, get_output_by_filename } from '@/helpers/logs.js'
import { get as getSettings } from '@/helpers/settings.ts'
import type { GameInstance } from '@/helpers/types'

import { analyzeCrash, type CrashCause, looksLikeCrash } from './analyze-crash'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const router = useRouter()

const messages = defineMessages({
	title: { id: 'app.crash-helper.title', defaultMessage: '{name} crashed' },
	oomHeadline: {
		id: 'app.crash-helper.oom.headline',
		defaultMessage: 'The game ran out of memory',
	},
	oomBody: {
		id: 'app.crash-helper.oom.body',
		defaultMessage:
			'Minecraft used all the memory it was given. Big modpacks often need more than the default.',
	},
	oomFix: { id: 'app.crash-helper.oom.fix', defaultMessage: 'Give it {gb} GB of memory' },
	javaHeadline: {
		id: 'app.crash-helper.java.headline',
		defaultMessage: 'Wrong Java version',
	},
	javaBody: {
		id: 'app.crash-helper.java.body',
		defaultMessage:
			'This version of Minecraft or one of its mods needs {needed, select, other {Java {needed}} unknown {a newer Java}}. 3ellwa Space can pick the right Java automatically.',
	},
	javaFix: { id: 'app.crash-helper.java.fix', defaultMessage: 'Use the recommended Java' },
	missingHeadline: {
		id: 'app.crash-helper.missing.headline',
		defaultMessage: 'A mod is missing something it needs',
	},
	missingBody: {
		id: 'app.crash-helper.missing.body',
		defaultMessage:
			'{mod, select, unknown {A mod} other {{mod}}} needs {missing} to run. Install it, or disable the mod that needs it.',
	},
	findMod: { id: 'app.crash-helper.find-mod', defaultMessage: 'Find {name}' },
	incompatibleHeadline: {
		id: 'app.crash-helper.incompatible.headline',
		defaultMessage: 'Some mods don’t work together',
	},
	incompatibleBody: {
		id: 'app.crash-helper.incompatible.body',
		defaultMessage: 'Two or more mods conflict with each other. Disable one of them and try again.',
	},
	duplicateHeadline: {
		id: 'app.crash-helper.duplicate.headline',
		defaultMessage: 'The same mod is installed twice',
	},
	duplicateBody: {
		id: 'app.crash-helper.duplicate.body',
		defaultMessage: 'Keep one copy and disable or remove the other.',
	},
	mixinHeadline: {
		id: 'app.crash-helper.mixin.headline',
		defaultMessage: 'A mod failed to load',
	},
	mixinBody: {
		id: 'app.crash-helper.mixin.body',
		defaultMessage:
			'A mod could not hook into the game. It is usually outdated or made for a different Minecraft version.',
	},
	gpuHeadline: {
		id: 'app.crash-helper.gpu.headline',
		defaultMessage: 'Your graphics driver couldn’t start the game',
	},
	gpuBody: {
		id: 'app.crash-helper.gpu.body',
		defaultMessage:
			'Update your graphics driver from NVIDIA, AMD or Intel’s website, then restart your computer. On laptops, make sure the game uses the dedicated graphics card.',
	},
	modErrorHeadline: {
		id: 'app.crash-helper.mod-error.headline',
		defaultMessage: 'A mod caused the crash',
	},
	modErrorBody: {
		id: 'app.crash-helper.mod-error.body',
		defaultMessage:
			'The crash report points at the mods below. Disable one, or check for an update.',
	},
	unknownHeadline: {
		id: 'app.crash-helper.unknown.headline',
		defaultMessage: 'We couldn’t tell exactly why',
	},
	unknownBody: {
		id: 'app.crash-helper.unknown.body',
		defaultMessage:
			'Check the log for the first red error, or copy the log and ask for help. Mods you added most recently are the usual suspects.',
	},
	disableMod: { id: 'app.crash-helper.disable-mod', defaultMessage: 'Disable {name}' },
	disabled: { id: 'app.crash-helper.disabled', defaultMessage: '{name} disabled' },
	fixed: { id: 'app.crash-helper.fixed', defaultMessage: 'Done. Try playing again.' },
	details: { id: 'app.crash-helper.details', defaultMessage: 'Error' },
	openLogs: { id: 'app.crash-helper.open-logs', defaultMessage: 'Open logs' },
	copyLog: { id: 'app.crash-helper.copy-log', defaultMessage: 'Copy log' },
	copied: { id: 'app.crash-helper.copied', defaultMessage: 'Copied' },
	playAgain: { id: 'app.crash-helper.play-again', defaultMessage: 'Play again' },
})

const modal = ref<InstanceType<typeof NewModal>>()
const instance = ref<GameInstance | null>(null)
const cause = ref<CrashCause | null>(null)
const logText = ref('')
const busy = ref<string | null>(null)
const applied = ref<string[]>([])
const copied = ref(false)
const suggestedMemoryMb = ref<number | null>(null)

const launchedAt = new Map<string, number>()

useAppEvent('process', (event) => {
	const now = Math.floor(Date.now() / 1000)
	if (event.event === 'launched') {
		launchedAt.set(event.instance_id, now)
	} else if (event.event === 'finished') {
		const since = launchedAt.get(event.instance_id) ?? now - 6 * 3600
		launchedAt.delete(event.instance_id)
		window.setTimeout(() => void inspect(event.instance_id, since), 1500)
	}
})

/** Text of this session: any crash report written since launch, plus the end of latest.log. */
async function collectLogs(instanceId: string, since: number): Promise<string> {
	const parts: string[] = []
	try {
		const reports = (await get_logs(instanceId, true)) as {
			log_type: string
			filename: string
			age: number
		}[]
		const report = reports.find((log) => log.log_type === 'CrashReport' && log.age >= since - 5)
		if (report)
			parts.push(String(await get_output_by_filename(instanceId, 'CrashReport', report.filename)))
	} catch {
		// no crash reports
	}
	try {
		const latest = (await get_latest_log_cursor(instanceId, 0)) as { output: string }
		parts.push(String(latest.output ?? '').slice(-400_000))
	} catch {
		// no latest.log
	}
	return parts.join('\n')
}

async function inspect(instanceId: string, since: number) {
	try {
		const text = await collectLogs(instanceId, since)
		if (!text || !looksLikeCrash(text)) return
		instance.value = await get(instanceId)
		if (!instance.value) return
		cause.value = analyzeCrash(text)
		logText.value = text
		applied.value = []
		copied.value = false
		suggestedMemoryMb.value = cause.value.kind === 'out-of-memory' ? await suggestMemory() : null
		modal.value?.show()
	} catch (error) {
		console.warn('[CrashHelper] could not inspect crash', error)
	}
}

async function suggestMemory(): Promise<number | null> {
	const current =
		instance.value?.memory?.maximum ??
		((await getSettings()) as { memory?: { maximum: number } }).memory?.maximum ??
		2048
	const totalMb = Math.floor(Number(await get_max_memory().catch(() => 0)) / 1024)
	const ceiling = totalMb ? Math.floor((totalMb * 0.6) / 512) * 512 : 8192
	const next = Math.min(Math.max(Math.ceil((current * 1.5) / 512) * 512, 4096), ceiling)
	return next > current ? next : null
}

const view = computed(() => {
	const c = cause.value
	if (!c) return null
	switch (c.kind) {
		case 'out-of-memory':
			return {
				headline: messages.oomHeadline,
				body: formatMessage(messages.oomBody),
				icon: MemoryStickIcon,
			}
		case 'wrong-java':
			return {
				headline: messages.javaHeadline,
				body: formatMessage(messages.javaBody, { needed: c.needed ? String(c.needed) : 'unknown' }),
				icon: CpuIcon,
			}
		case 'missing-dependency':
			return {
				headline: messages.missingHeadline,
				body: formatMessage(messages.missingBody, {
					mod: c.mod ?? 'unknown',
					missing: c.missing.join(', ') || '?',
				}),
				icon: SearchIcon,
			}
		case 'incompatible-mods':
			return {
				headline: messages.incompatibleHeadline,
				body: formatMessage(messages.incompatibleBody),
				icon: BugIcon,
			}
		case 'duplicate-mod':
			return {
				headline: messages.duplicateHeadline,
				body: formatMessage(messages.duplicateBody),
				icon: BugIcon,
			}
		case 'mixin-failure':
			return {
				headline: messages.mixinHeadline,
				body: formatMessage(messages.mixinBody),
				icon: BugIcon,
			}
		case 'graphics-driver':
			return {
				headline: messages.gpuHeadline,
				body: formatMessage(messages.gpuBody),
				icon: CpuIcon,
			}
		case 'mod-error':
			return {
				headline: messages.modErrorHeadline,
				body: formatMessage(messages.modErrorBody),
				icon: BugIcon,
			}
		default:
			return {
				headline: messages.unknownHeadline,
				body: formatMessage(messages.unknownBody),
				icon: BugIcon,
			}
	}
})

const modsToDisable = computed(() => {
	const c = cause.value
	if (!c) return []
	if (c.kind === 'missing-dependency') return c.mod ? [c.mod] : []
	if ('mods' in c) return c.mods
	return []
})
const missingMods = computed(() =>
	cause.value?.kind === 'missing-dependency' ? cause.value.missing : [],
)
const errorLine = computed(() => (cause.value && 'error' in cause.value ? cause.value.error : null))

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

async function disableMod(name: string) {
	if (!instance.value) return
	busy.value = name
	try {
		const target = norm(name)
		const items = await get_content_items(instance.value.id)
		const match = items.find(
			(item) =>
				item.enabled !== false &&
				!!item.file_path &&
				(norm(item.project?.slug) === target ||
					norm(item.project?.title) === target ||
					norm(item.file_name).startsWith(target)),
		)
		if (!match?.file_path) {
			await router.push(`/instance/${encodeURIComponent(instance.value.id)}`)
			modal.value?.hide()
			return
		}
		await toggle_disable_project(instance.value.id, match.file_path, false)
		applied.value.push(formatMessage(messages.disabled, { name }))
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

async function giveMemory() {
	if (!instance.value || !suggestedMemoryMb.value) return
	busy.value = 'memory'
	try {
		await edit(instance.value.id, { memory: { maximum: suggestedMemoryMb.value } })
		applied.value.push(formatMessage(messages.fixed))
		suggestedMemoryMb.value = null
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

async function useRecommendedJava() {
	if (!instance.value) return
	busy.value = 'java'
	try {
		await edit(instance.value.id, { java_path: null as unknown as undefined })
		applied.value.push(formatMessage(messages.fixed))
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

async function findMod(slug: string) {
	if (!instance.value) return
	modal.value?.hide()
	await router.push({
		path: `/project/${encodeURIComponent(slug)}`,
		query: { i: instance.value.id },
	})
}

async function openLogs() {
	if (!instance.value) return
	modal.value?.hide()
	await router.push(`/instance/${encodeURIComponent(instance.value.id)}/logs`)
}

async function copyLog() {
	await navigator.clipboard.writeText(logText.value.slice(-200_000)).catch(() => {})
	copied.value = true
}

async function playAgain() {
	if (!instance.value) return
	modal.value?.hide()
	await run(instance.value.id).catch((error) => handleError(error as Error))
}
</script>

<template>
	<NewModal
		ref="modal"
		:header="formatMessage(messages.title, { name: instance?.name ?? 'Minecraft' })"
		fade="danger"
		max-width="580px"
	>
		<div v-if="view" class="flex flex-col gap-4">
			<div class="flex gap-3">
				<component :is="view.icon" class="mt-1 size-6 shrink-0 text-red" aria-hidden="true" />
				<div class="flex flex-col gap-1">
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(view.headline) }}
					</h3>
					<p class="m-0 text-secondary">{{ view.body }}</p>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<Button
					v-if="cause?.kind === 'out-of-memory' && suggestedMemoryMb"
					type="colored"
					color="brand"
					:disabled="!!busy"
					@click="giveMemory"
				>
					<SpinnerIcon v-if="busy === 'memory'" class="animate-spin" />
					<MemoryStickIcon v-else />
					{{
						formatMessage(messages.oomFix, {
							gb: (suggestedMemoryMb / 1024).toFixed(1).replace(/\.0$/, ''),
						})
					}}
				</Button>
				<Button
					v-if="cause?.kind === 'wrong-java' && instance?.java_path"
					type="colored"
					color="brand"
					:disabled="!!busy"
					@click="useRecommendedJava"
				>
					<SpinnerIcon v-if="busy === 'java'" class="animate-spin" />
					<CpuIcon v-else />
					{{ formatMessage(messages.javaFix) }}
				</Button>
				<Button
					v-for="slug in missingMods"
					:key="`find-${slug}`"
					type="colored"
					color="brand"
					@click="findMod(slug)"
				>
					<SearchIcon />
					{{ formatMessage(messages.findMod, { name: slug }) }}
				</Button>
				<Button
					v-for="name in modsToDisable"
					:key="`disable-${name}`"
					type="outlined"
					:disabled="!!busy"
					@click="disableMod(name)"
				>
					<SpinnerIcon v-if="busy === name" class="animate-spin" />
					<PowerOffIcon v-else />
					{{ formatMessage(messages.disableMod, { name }) }}
				</Button>
			</div>

			<ul v-if="applied.length" class="m-0 flex list-none flex-col gap-1 p-0 text-sm text-green">
				<li v-for="line in applied" :key="line">{{ line }}</li>
			</ul>

			<div v-if="errorLine" class="rounded-xl bg-surface-2 px-4 py-3">
				<div class="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary">
					{{ formatMessage(messages.details) }}
				</div>
				<code class="block break-all text-sm text-contrast">{{ errorLine }}</code>
			</div>
		</div>

		<template #actions>
			<div class="flex flex-wrap justify-end gap-2">
				<Button type="quiet" @click="copyLog">
					<ClipboardCopyIcon />
					{{ formatMessage(copied ? messages.copied : messages.copyLog) }}
				</Button>
				<Button type="outlined" @click="openLogs">
					<FileTextIcon />
					{{ formatMessage(messages.openLogs) }}
				</Button>
				<Button type="outlined" @click="modal?.hide()">
					<XIcon />
					{{ formatMessage(commonMessages.closeButton) }}
				</Button>
				<Button v-if="applied.length" type="colored" color="green" @click="playAgain">
					<PlayIcon />
					{{ formatMessage(messages.playAgain) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>
