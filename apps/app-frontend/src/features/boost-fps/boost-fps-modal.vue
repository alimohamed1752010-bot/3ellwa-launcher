<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import { CheckIcon, GaugeIcon, MemoryStickIcon, SpinnerIcon, XIcon } from '@modrinth/assets'
import {
	Button,
	Checkbox,
	commonMessages,
	defineMessages,
	injectNotificationManager,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import { get_project_many, get_project_versions } from '@/helpers/cache.js'
import { edit, get_content_items, install_project_with_dependencies } from '@/helpers/instance'
import { get_max_memory } from '@/helpers/jre.js'
import { get as getSettings } from '@/helpers/settings.ts'
import type { GameInstance } from '@/helpers/types'

import { PERFORMANCE_MODS, type PerformanceMod, recommendedMemoryMb } from './performance-mods'

const props = defineProps<{ instance: GameInstance }>()

const { formatMessage } = useVIntl()
const { addNotification, handleError } = injectNotificationManager()

const messages = defineMessages({
	title: { id: 'app.boost-fps.title', defaultMessage: 'Boost FPS' },
	intro: {
		id: 'app.boost-fps.intro',
		defaultMessage:
			'Adds popular performance mods that make the game run smoother without changing how it plays. You can remove them any time from the Content tab.',
	},
	vanilla: {
		id: 'app.boost-fps.vanilla',
		defaultMessage:
			'Performance mods need a mod loader. Create a Fabric or NeoForge instance to use Boost FPS.',
	},
	rendering: { id: 'app.boost-fps.reason.rendering', defaultMessage: 'Faster rendering, more FPS' },
	logic: { id: 'app.boost-fps.reason.logic', defaultMessage: 'Faster game logic and ticks' },
	memory: { id: 'app.boost-fps.reason.memory', defaultMessage: 'Uses less memory' },
	culling: { id: 'app.boost-fps.reason.culling', defaultMessage: 'Skips drawing hidden entities' },
	startup: { id: 'app.boost-fps.reason.startup', defaultMessage: 'Faster loading, fewer bugs' },
	installed: { id: 'app.boost-fps.status.installed', defaultMessage: 'Already installed' },
	conflict: {
		id: 'app.boost-fps.status.conflict',
		defaultMessage: 'Skipped, you already have a mod that does this',
	},
	unavailable: {
		id: 'app.boost-fps.status.unavailable',
		defaultMessage: 'Not available for this version',
	},
	memoryOption: {
		id: 'app.boost-fps.memory-option',
		defaultMessage: 'Also give the game {gb} GB of memory (now {current} GB)',
	},
	boost: {
		id: 'app.boost-fps.boost',
		defaultMessage: 'Add {count, plural, one {# mod} other {# mods}}',
	},
	nothing: { id: 'app.boost-fps.nothing', defaultMessage: 'Nothing to add, you’re all set' },
	doneTitle: { id: 'app.boost-fps.done-title', defaultMessage: 'FPS boost added' },
	doneText: {
		id: 'app.boost-fps.done-text',
		defaultMessage: 'Added {count, plural, one {# mod} other {# mods}}. Play to try it out.',
	},
})

type Row = {
	mod: PerformanceMod
	title: string
	iconUrl: string | null
	projectId: string | null
	versionId: string | null
	status: 'add' | 'installed' | 'conflict' | 'unavailable'
}

const modal = ref<InstanceType<typeof NewModal>>()
const loading = ref(false)
const working = ref(false)
const rows = ref<Row[]>([])
const currentMemoryMb = ref(0)
const suggestedMemoryMb = ref(0)
const raiseMemory = ref(true)

const loader = computed(() => props.instance.loader)
const supported = computed(() => !!PERFORMANCE_MODS[loader.value])
const toAdd = computed(() => rows.value.filter((row) => row.status === 'add'))
const memoryHelps = computed(() => suggestedMemoryMb.value > currentMemoryMb.value)

const gb = (mb: number) => (mb / 1024).toFixed(1).replace(/\.0$/, '')
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const VERSION_TYPE_RANK: Record<string, number> = { release: 0, beta: 1, alpha: 2 }

function pickVersion(versions: Labrinth.Versions.v2.Version[]): string | null {
	const loaders = loader.value === 'quilt' ? ['quilt', 'fabric'] : [loader.value]
	const compatible = versions
		.filter(
			(version) =>
				version.game_versions.includes(props.instance.game_version) &&
				version.loaders.some((l) => loaders.includes(l)),
		)
		.sort(
			(a, b) =>
				(VERSION_TYPE_RANK[a.version_type] ?? 3) - (VERSION_TYPE_RANK[b.version_type] ?? 3) ||
				Date.parse(b.date_published) - Date.parse(a.date_published),
		)
	return compatible[0]?.id ?? null
}

async function load() {
	const mods = PERFORMANCE_MODS[loader.value] ?? []
	loading.value = true
	try {
		const [items, projects] = await Promise.all([
			get_content_items(props.instance.id),
			get_project_many(mods.map((mod) => mod.slug)) as Promise<Labrinth.Projects.v2.Project[]>,
		])
		const installed = new Set(
			items.flatMap((item) => [norm(item.project?.slug), norm(item.file_name.split(/[-_ ]\d/)[0])]),
		)
		const has = (slug: string) =>
			installed.has(norm(slug)) || [...installed].some((name) => name.startsWith(norm(slug)))

		rows.value = await Promise.all(
			mods.map(async (mod): Promise<Row> => {
				const project = projects.find((p) => p.slug === mod.slug) ?? null
				const base = {
					mod,
					title: project?.title ?? mod.slug,
					iconUrl: project?.icon_url ?? null,
					projectId: project?.id ?? null,
					versionId: null,
				}
				if (has(mod.slug)) return { ...base, status: 'installed' }
				if (mod.conflictsWith?.some(has)) return { ...base, status: 'conflict' }
				if (!project) return { ...base, status: 'unavailable' }
				const versions = (await get_project_versions(project.id).catch(
					() => [],
				)) as Labrinth.Versions.v2.Version[]
				const versionId = pickVersion(versions)
				return versionId
					? { ...base, versionId, status: 'add' }
					: { ...base, status: 'unavailable' }
			}),
		)

		const globalMemory = ((await getSettings()) as { memory?: { maximum: number } }).memory?.maximum
		currentMemoryMb.value = props.instance.memory?.maximum ?? globalMemory ?? 2048
		const totalMb = Math.floor(Number(await get_max_memory().catch(() => 0)) / 1024)
		suggestedMemoryMb.value = recommendedMemoryMb(totalMb)
		raiseMemory.value = memoryHelps.value
	} catch (error) {
		handleError(error as Error)
	} finally {
		loading.value = false
	}
}

async function show() {
	rows.value = []
	modal.value?.show()
	if (supported.value) await load()
}

async function boost() {
	working.value = true
	let added = 0
	try {
		for (const row of toAdd.value) {
			if (!row.projectId || !row.versionId) continue
			await install_project_with_dependencies(props.instance.id, {
				project_id: row.projectId,
				version_id: row.versionId,
				content_type: 'mod',
			})
			added++
		}
		if (raiseMemory.value && memoryHelps.value) {
			await edit(props.instance.id, { memory: { maximum: suggestedMemoryMb.value } })
		}
		addNotification({
			title: formatMessage(messages.doneTitle),
			text: formatMessage(messages.doneText, { count: added }),
			type: 'success',
		})
		modal.value?.hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		working.value = false
	}
}

defineExpose({ show })
</script>

<template>
	<NewModal ref="modal" :header="formatMessage(messages.title)" max-width="560px">
		<div class="flex flex-col gap-4">
			<p class="m-0 text-secondary">
				{{ formatMessage(supported ? messages.intro : messages.vanilla) }}
			</p>
			<div v-if="loading" class="flex justify-center py-6">
				<SpinnerIcon class="size-6 animate-spin" />
			</div>
			<template v-else-if="supported">
				<ul class="m-0 flex list-none flex-col gap-2 p-0">
					<li
						v-for="row in rows"
						:key="row.mod.slug"
						class="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3"
						:class="{ 'opacity-60': row.status !== 'add' }"
					>
						<img v-if="row.iconUrl" :src="row.iconUrl" alt="" class="size-9 shrink-0 rounded-lg" />
						<GaugeIcon v-else class="size-9 shrink-0 text-secondary" aria-hidden="true" />
						<div class="flex min-w-0 grow flex-col">
							<span class="font-semibold text-contrast">{{ row.title }}</span>
							<span class="text-sm text-secondary">
								{{
									row.status === 'add'
										? formatMessage(messages[row.mod.reason])
										: formatMessage(messages[row.status])
								}}
							</span>
						</div>
						<CheckIcon
							v-if="row.status === 'add' || row.status === 'installed'"
							class="size-5 text-brand"
						/>
					</li>
				</ul>
				<label v-if="memoryHelps" class="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
					<Checkbox v-model="raiseMemory" />
					<MemoryStickIcon class="size-5 shrink-0 text-secondary" aria-hidden="true" />
					<span class="text-contrast">
						{{
							formatMessage(messages.memoryOption, {
								gb: gb(suggestedMemoryMb),
								current: gb(currentMemoryMb),
							})
						}}
					</span>
				</label>
			</template>
		</div>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button type="outlined" @click="modal?.hide()">
					<XIcon />
					{{ formatMessage(commonMessages.cancelButton) }}
				</Button>
				<Button
					v-if="supported"
					type="colored"
					color="brand"
					:disabled="loading || working || (!toAdd.length && !(raiseMemory && memoryHelps))"
					@click="boost"
				>
					<SpinnerIcon v-if="working" class="animate-spin" />
					<GaugeIcon v-else />
					{{
						toAdd.length || (raiseMemory && memoryHelps)
							? formatMessage(messages.boost, { count: toAdd.length })
							: formatMessage(messages.nothing)
					}}
				</Button>
			</div>
		</template>
	</NewModal>
</template>
