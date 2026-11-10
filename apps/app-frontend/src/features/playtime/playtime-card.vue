<script setup lang="ts">
import { ClockIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { getInstanceIconUrl } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'

const props = defineProps<{ instances: GameInstance[] }>()

const { formatMessage } = useVIntl()
const router = useRouter()

const messages = defineMessages({
	title: { id: 'app.playtime.title', defaultMessage: 'Your playtime' },
	total: { id: 'app.playtime.total', defaultMessage: '{time} played' },
	across: {
		id: 'app.playtime.across',
		defaultMessage: 'across {count, plural, one {# instance} other {# instances}}',
	},
	mostPlayed: { id: 'app.playtime.most-played', defaultMessage: 'Most played' },
	hours: { id: 'app.playtime.hours', defaultMessage: '{h} h {m} min' },
	hoursOnly: { id: 'app.playtime.hours-only', defaultMessage: '{h} h' },
	minutes: { id: 'app.playtime.minutes', defaultMessage: '{m} min' },
})

const played = computed(() =>
	props.instances
		.map((instance) => ({
			instance,
			seconds: (instance.recent_time_played ?? 0) + (instance.submitted_time_played ?? 0),
		}))
		.filter((entry) => entry.seconds >= 60)
		.sort((a, b) => b.seconds - a.seconds),
)
const totalSeconds = computed(() => played.value.reduce((sum, entry) => sum + entry.seconds, 0))
const top = computed(() => played.value.slice(0, 3))

function formatDuration(seconds: number) {
	const h = Math.floor(seconds / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	if (h >= 100) return formatMessage(messages.hoursOnly, { h })
	if (h > 0) return formatMessage(messages.hours, { h, m })
	return formatMessage(messages.minutes, { m: Math.max(1, m) })
}
</script>

<template>
	<section
		v-if="played.length"
		class="flex flex-col gap-4 rounded-2xl border border-solid border-[--brand-gradient-border] bg-bg-raised p-5 sm:flex-row sm:items-center sm:gap-8"
	>
		<div class="flex shrink-0 items-center gap-3">
			<div class="grid size-11 place-items-center rounded-xl bg-brand-highlight text-brand">
				<ClockIcon class="size-6" aria-hidden="true" />
			</div>
			<div class="flex flex-col">
				<span class="text-sm text-secondary">{{ formatMessage(messages.title) }}</span>
				<span class="text-xl font-bold text-contrast">
					{{ formatMessage(messages.total, { time: formatDuration(totalSeconds) }) }}
				</span>
				<span class="text-sm text-secondary">
					{{ formatMessage(messages.across, { count: played.length }) }}
				</span>
			</div>
		</div>
		<div class="flex min-w-0 grow flex-col gap-2">
			<span class="text-xs font-semibold uppercase tracking-wide text-secondary">
				{{ formatMessage(messages.mostPlayed) }}
			</span>
			<button
				v-for="entry in top"
				:key="entry.instance.id"
				class="group flex min-w-0 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left"
				@click="router.push(`/instance/${encodeURIComponent(entry.instance.id)}`)"
			>
				<img
					v-if="getInstanceIconUrl(entry.instance.icon_path)"
					:src="getInstanceIconUrl(entry.instance.icon_path)!"
					alt=""
					class="size-6 shrink-0 rounded-md"
				/>
				<span v-else class="size-6 shrink-0 rounded-md bg-surface-4" />
				<span class="w-40 shrink-0 truncate font-medium text-contrast group-hover:underline">
					{{ entry.instance.name }}
				</span>
				<span class="h-2 min-w-0 grow overflow-hidden rounded-full bg-surface-4">
					<span
						class="block h-full rounded-full"
						:style="{
							width: `${Math.max(4, (entry.seconds / top[0].seconds) * 100)}%`,
							background: 'var(--brand-button-gradient, var(--color-brand))',
						}"
					/>
				</span>
				<span class="w-24 shrink-0 text-right text-sm text-secondary">
					{{ formatDuration(entry.seconds) }}
				</span>
			</button>
		</div>
	</section>
</template>
