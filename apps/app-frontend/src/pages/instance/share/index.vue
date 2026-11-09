<template>
	<div class="flex flex-col items-center gap-4 py-10 text-center">
		<h2 class="m-0 text-xl font-semibold text-contrast">Share this setup</h2>
		<p class="m-0 max-w-md text-secondary">
			Create a code for {{ instance.name }} (Minecraft version, loader and mod list). Anyone signed in to
			3ellwa Space can paste it under Settings, 3ellwa Account, Share a setup to get the same instance.
			Worlds and personal files are never shared.
		</p>
		<Button v-if="!account" color="brand" @click="signIn">Sign in to 3ellwa Space</Button>
		<template v-else>
			<Button color="brand" :disabled="busy" @click="create">
				{{ busy ? 'Creating...' : result ? 'Create another code' : 'Create share code' }}
			</Button>
			<div v-if="result" class="flex flex-col items-center gap-2">
				<div class="text-2xl font-semibold tracking-widest text-contrast">{{ result.code }}</div>
				<Button @click="copy(result.link)">Copy link</Button>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { Button, injectNotificationManager } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { spaceAccount, spaceSignIn } from '@/helpers/space_account'
import { shareInstance } from '@/helpers/space_cloud'

import { injectInstancePage } from '../instance-context'

const { handleError } = injectNotificationManager()
const instancePage = injectInstancePage()
const instance = computed(() => instancePage.instance.value!)
const account = computed(() => spaceAccount.value)
const busy = ref(false)
const result = ref<{ code: string; link: string } | null>(null)

async function signIn() {
	try {
		await spaceSignIn()
	} catch (error) {
		handleError(error as Error)
	}
}

async function create() {
	busy.value = true
	try {
		result.value = await shareInstance(instance.value.id)
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
	}
}

const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => undefined)
</script>
