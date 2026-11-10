<template>
	<Transition name="splash-fade" @after-leave="onAfterLeave">
		<div v-if="!doneLoading" class="splash-screen" :class="`${theme.active}-mode`">
			<div class="splash-sky" data-tauri-drag-region></div>
			<div class="app-logo-wrapper" data-tauri-drag-region>
				<div class="app-logo">
					<div class="emblem-halo" aria-hidden="true">
						<div class="orbit"></div>
						<div class="orbit orbit-2"></div>
						<img :src="logoUrl" alt="" class="app-logo-image" />
					</div>
					<span class="app-logo-name">3ellwa <b>Space</b></span>
				</div>
				<ProgressBar class="loading-bar" :progress="Math.min(loadingProgress, 100)" />
				<span v-if="message" class="splash-message">{{ message }}</span>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { injectLoadingState } from '@modrinth/ui'
import { onMounted, ref, watch } from 'vue'

import logoUrl from '@/assets/3ellwa-logo-large.png'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useAppEvent } from '@/composables/use-app-event'
import { useTheme } from '@/composables/use-theme.ts'
import { debugStartup } from '@/helpers/startup-debug'

const theme = useTheme()

const doneLoading = ref(false)
const loadingProgress = ref(0)
const message = ref()

const MIN_DISPLAY_MS = 500
const mountedAt = Date.now()

const loading = injectLoadingState()
onMounted(() => debugStartup('Splash mounted'))

function onAfterLeave() {
	debugStartup('Splash fade completed', { displayedMs: Date.now() - mountedAt })
	loading.setEnabled(true)
}

watch(
	[loading.barEnabled, loading.pending],
	([barEnabled, pending]) => {
		debugStartup('Splash loading state changed', { barEnabled, pending })
		if (barEnabled) {
			return
		}

		if (pending) {
			loadingProgress.value = 0
			fakeLoadingIncrease()
			return
		}

		const elapsed = Date.now() - mountedAt
		const delay = Math.max(0, MIN_DISPLAY_MS - elapsed)
		debugStartup('Splash dismissal scheduled', { delayMs: delay, displayedMs: elapsed })

		setTimeout(() => {
			if (loading.pending.value) {
				debugStartup('Splash dismissal deferred: new loading work')
				return
			}
			doneLoading.value = true
			debugStartup('Splash fade started', { displayedMs: Date.now() - mountedAt })
		}, delay)
	},
	{ immediate: true },
)

function fakeLoadingIncrease() {
	if (loadingProgress.value < 95) {
		setTimeout(() => {
			loadingProgress.value += 2
			fakeLoadingIncrease()
		}, 5)
	}
}

useAppEvent('loading', (e) => {
	if (e.event.type === 'directory_move') {
		loadingProgress.value = 100 * (e.fraction ?? 1)
		message.value = 'Updating app directory...'
	}
})
</script>

<style scoped lang="scss">
.splash-screen {
	position: fixed;
	inset: 0;
	z-index: 10000;
	background: var(--color-bg);
	--splash-glow-1: rgba(7, 87, 255, 0.3);
	--splash-glow-2: rgba(0, 170, 255, 0.1);
	--splash-glow-3: rgba(115, 245, 255, 0.06);

	&.light-mode {
		--splash-glow-1: rgba(0, 170, 255, 0.22);
		--splash-glow-2: rgba(7, 87, 255, 0.08);
		--splash-glow-3: rgba(115, 245, 255, 0.12);
	}
}

.splash-fade-leave-active {
	transition: opacity 0.35s ease-in-out;
}

.splash-fade-leave-to {
	opacity: 0;
}

.splash-sky {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(900px 520px at 50% -8%, var(--splash-glow-1), transparent 62%),
		radial-gradient(700px 420px at 88% 40%, var(--splash-glow-2), transparent 60%),
		radial-gradient(620px 460px at 8% 80%, var(--splash-glow-3), transparent 60%);
	z-index: 1;

	&::after {
		// faint starfield
		content: '';
		position: absolute;
		inset: 0;
		opacity: 0.55;
		background-image:
			radial-gradient(1px 1px at 12% 22%, #fff 50%, transparent 51%),
			radial-gradient(1px 1px at 27% 68%, #bfefff 50%, transparent 51%),
			radial-gradient(1.5px 1.5px at 41% 14%, #fff 50%, transparent 51%),
			radial-gradient(1px 1px at 58% 82%, #fff 50%, transparent 51%),
			radial-gradient(1px 1px at 69% 31%, #bfefff 50%, transparent 51%),
			radial-gradient(1.5px 1.5px at 83% 64%, #fff 50%, transparent 51%),
			radial-gradient(1px 1px at 91% 12%, #fff 50%, transparent 51%),
			radial-gradient(1px 1px at 6% 52%, #bfefff 50%, transparent 51%),
			radial-gradient(1px 1px at 35% 91%, #fff 50%, transparent 51%),
			radial-gradient(1px 1px at 76% 93%, #bfefff 50%, transparent 51%);
	}
}

.light-mode .splash-sky::after {
	display: none;
}

.app-logo-wrapper {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	gap: 1.5rem;
	color: var(--color-contrast);
	z-index: 2;
}

.app-logo {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.emblem-halo {
	position: relative;
	display: grid;
	place-items: center;
	width: 13rem;
	height: 13rem;
}

.orbit {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	border: 1px solid rgba(115, 245, 255, 0.14);
	transform: rotate(-18deg) scaleY(0.42);

	&::after {
		content: '';
		position: absolute;
		top: 50%;
		left: -3px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #73f5ff;
		box-shadow: 0 0 10px #00aaff;
	}
}

.orbit-2 {
	inset: 1.5rem;
	transform: rotate(32deg) scaleY(0.38);
	border-color: rgba(0, 170, 255, 0.12);

	&::after {
		left: auto;
		right: -3px;
	}
}

.app-logo-image {
	position: relative;
	height: 9.5rem;
	width: 9.5rem;
	filter: drop-shadow(0 0 18px rgba(0, 170, 255, 0.85)) drop-shadow(0 0 48px rgba(7, 87, 255, 0.55));
}

.app-logo-name {
	font-size: 1.85rem;
	font-weight: 700;
	line-height: 1;
	letter-spacing: -0.01em;
	color: var(--color-contrast);

	b {
		font-weight: 800;
		background: var(--brand-text-gradient);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
}

.loading-bar {
	width: 18rem;
	max-width: 18rem;
}

.splash-message {
	color: var(--color-secondary);
	font-size: 0.9rem;
}

@media (prefers-reduced-motion: no-preference) {
	.app-logo-image {
		animation: emblem-breathe 5s ease-in-out infinite;
	}

	.orbit {
		animation: orbit-spin 14s linear infinite;
	}

	.orbit-2 {
		animation-duration: 20s;
		animation-direction: reverse;
	}
}

@keyframes emblem-breathe {
	0%,
	100% {
		transform: scale(1);
		opacity: 0.94;
	}
	50% {
		transform: scale(1.04);
		opacity: 1;
	}
}

@keyframes orbit-spin {
	to {
		rotate: 360deg;
	}
}
</style>
