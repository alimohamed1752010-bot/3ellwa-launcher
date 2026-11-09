<script setup lang="ts">
import { LogInIcon, LogOutIcon } from '@modrinth/assets'
import { Button, injectNotificationManager } from '@modrinth/ui'
import { onMounted, ref } from 'vue'

import { list as listInstances } from '@/helpers/instance'
import {
	refreshSpaceAccount,
	spaceRequest,
	spaceAccount,
	spaceSignIn,
	spaceSignOut,
	spaceSigningIn,
	spaceUserName,
} from '@/helpers/space_account'
import {
	cloudInstances,
	cloudSkinCount,
	cloudStatus,
	deleteMyShare,
	forgetCloudInstance,
	friendsState,
	importShared,
	mySharedSetups,
	refreshFriends,
	refreshMyShares,
	removeFriend,
	requestFriend,
	respondFriend,
	restoreCloudInstance,
	restoreCloudSkins,
	shareInstance,
	syncInstances,
	syncSkins,
} from '@/helpers/space_cloud'
import type { GameInstance } from '@/helpers/types'

const { handleError, addNotification } = injectNotificationManager()

const localInstances = ref<GameInstance[]>([])
const shareChoice = ref('')
const importCode = ref('')
const friendName = ref('')
const working = ref<string | null>(null)
const lastShare = ref<{ code: string; link: string } | null>(null)

async function loadAll() {
	await refreshSpaceAccount()
	if (!spaceAccount.value) return
	localInstances.value = (await listInstances().catch(() => [])).filter(
		(i) => i.install_stage === 'installed' || i.install_stage === 'pack_installed',
	)
	if (!shareChoice.value && localInstances.value[0]) shareChoice.value = localInstances.value[0].id
	void syncInstances()
	void syncSkins()
	void refreshFriends()
	void refreshMyShares()
}
onMounted(loadAll)

async function run(label: string, fn: () => Promise<void>) {
	working.value = label
	try {
		await fn()
	} catch (error) {
		handleError(error as Error)
	} finally {
		working.value = null
	}
}

const signIn = () =>
	run('signin', async () => {
		await spaceSignIn()
		await loadAll()
	})
const signOut = () => run('signout', spaceSignOut)

const confirmDelete = ref(false)
const deleteAccount = () =>
	run('delete', async () => {
		if (!confirmDelete.value) {
			confirmDelete.value = true
			return
		}
		await spaceRequest('DELETE', '/api/me')
		confirmDelete.value = false
		await spaceSignOut()
		addNotification({
			type: 'success',
			title: 'Account deleted',
			text: 'Everything stored for your account was removed.',
		})
	})

const restore = (id: string) =>
	run(`restore:${id}`, async () => {
		const r = await restoreCloudInstance(id)
		addNotification({
			type: r.failed.length ? 'warning' : 'success',
			title: `Restored ${r.name}`,
			text: `${r.installed} mods installed${r.failed.length ? `, ${r.failed.length} could not be installed` : ''}.`,
		})
	})

const forget = (id: string) => run(`forget:${id}`, () => forgetCloudInstance(id))

const share = () =>
	run('share', async () => {
		if (!shareChoice.value) return
		lastShare.value = await shareInstance(shareChoice.value)
	})

const doImport = () =>
	run('import', async () => {
		const r = await importShared(importCode.value)
		importCode.value = ''
		addNotification({
			type: r.failed.length ? 'warning' : 'success',
			title: `Added ${r.name}`,
			text: `${r.installed} mods installed${r.failed.length ? `, ${r.failed.length} could not be installed` : ''}.`,
		})
	})

const addFriend = () =>
	run('friend', async () => {
		const status = await requestFriend(friendName.value)
		friendName.value = ''
		addNotification({
			type: 'success',
			title: status === 'accepted' ? 'You are now friends' : 'Friend request sent',
			text: '',
		})
	})

const restoreSkins = () =>
	run('skins', async () => {
		const n = await restoreCloudSkins()
		addNotification({ type: 'success', title: `Restored ${n} skin${n === 1 ? '' : 's'}`, text: '' })
	})

const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => undefined)
const box =
	'flex flex-col gap-3 rounded-2xl border border-solid border-button-border bg-button-bg p-4'
const input =
	'h-9 min-w-0 flex-1 rounded-xl border border-solid border-button-border bg-surface-2 px-3 text-contrast'
</script>

<template>
	<div class="flex flex-col gap-5">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">3ellwa Space account</h2>
			<p class="m-0 mt-1 text-secondary">
				Optional. Sign in with Discord to save your settings, instances, skins and friends to your
				account. You can play without one.
			</p>
		</div>

		<div v-if="spaceAccount" class="flex flex-col items-start gap-3">
			<div class="flex items-center gap-3">
				<img
					v-if="spaceAccount.user.avatarUrl"
					:src="String(spaceAccount.user.avatarUrl)"
					alt=""
					class="size-12 rounded-full"
				/>
				<div>
					<div class="font-semibold text-contrast">{{ spaceUserName(spaceAccount) }}</div>
					<div class="text-secondary">
						Signed in with Discord<span v-if="cloudStatus.last"> · synced</span>
					</div>
				</div>
			</div>
			<p v-if="cloudStatus.error" class="m-0 text-red">{{ cloudStatus.error }}</p>
			<div class="flex flex-wrap gap-2">
				<Button @click="signOut">
					<LogOutIcon aria-hidden="true" />
					Sign out
				</Button>
				<Button color="red" :disabled="working === 'delete'" @click="deleteAccount">
					{{ confirmDelete ? 'Press again to delete everything' : 'Delete my account' }}
				</Button>
			</div>
		</div>

		<div v-else class="flex flex-col items-start gap-3">
			<Button color="brand" :disabled="spaceSigningIn" @click="signIn">
				<LogInIcon aria-hidden="true" />
				{{ spaceSigningIn ? 'Waiting for your browser...' : 'Sign in to 3ellwa Space' }}
			</Button>
			<p class="m-0 text-secondary">
				Your browser opens 3ellwa.space, you continue with Discord, then come back here.
			</p>
		</div>

		<template v-if="spaceAccount">
			<!-- Friends -->
			<div :class="box" data-test="friends">
				<h3 class="m-0 text-base font-semibold text-contrast">Friends</h3>
				<form class="flex gap-2" @submit.prevent="addFriend">
					<input v-model="friendName" :class="input" placeholder="Add a friend by Discord username" />
					<Button color="brand" :disabled="!friendName.trim() || working === 'friend'" @click="addFriend">
						Add
					</Button>
				</form>
				<div v-for="f in friendsState.incoming" :key="'in' + f.id" class="flex items-center gap-2">
					<span class="flex-1 text-contrast">{{ f.username }} wants to be friends</span>
					<Button color="brand" @click="run('r', () => respondFriend(f.id, true))">Accept</Button>
					<Button @click="run('r', () => respondFriend(f.id, false))">Decline</Button>
				</div>
				<div v-for="f in friendsState.outgoing" :key="'out' + f.id" class="text-secondary">
					Request sent to {{ f.username }}
				</div>
				<div v-for="f in friendsState.friends" :key="f.id" class="flex items-center gap-2">
					<span
						class="size-2.5 rounded-full"
						:class="f.online ? 'bg-brand' : 'bg-secondary opacity-40'"
					/>
					<span class="text-contrast">{{ f.username }}</span>
					<span class="flex-1 text-secondary">
						{{ f.online ? (f.playing ? `Playing ${f.playing}` : 'Online') : 'Offline' }}
					</span>
					<Button @click="run('r', () => removeFriend(f.id))">Remove</Button>
				</div>
				<p
					v-if="!friendsState.friends.length && !friendsState.incoming.length && !friendsState.outgoing.length"
					class="m-0 text-secondary"
				>
					No friends yet. They need to have signed in to 3ellwa Space once.
				</p>
			</div>

			<!-- Cloud instances -->
			<div :class="box" data-test="cloud-instances">
				<div class="flex items-center gap-2">
					<h3 class="m-0 flex-1 text-base font-semibold text-contrast">Instances in your account</h3>
					<Button :disabled="cloudStatus.busy" @click="syncInstances">
						{{ cloudStatus.busy ? 'Syncing...' : 'Sync now' }}
					</Button>
				</div>
				<p class="m-0 text-secondary">
					Your instances (version, loader and mod list) are saved automatically. Ones missing on
					this PC show up here. Worlds are not synced.
				</p>
				<div v-for="c in cloudInstances" :key="c.syncId" class="flex items-center gap-2">
					<div class="flex-1">
						<div class="text-contrast">{{ c.name }}</div>
						<div class="text-secondary">
							Minecraft {{ c.game_version }} · {{ c.loader }} · {{ c.mods.length }} mods
						</div>
					</div>
					<Button color="brand" :disabled="working !== null" @click="restore(c.syncId)">
						{{ working === 'restore:' + c.syncId ? 'Restoring...' : 'Restore' }}
					</Button>
					<Button :disabled="working !== null" @click="forget(c.syncId)">Forget</Button>
				</div>
				<p v-if="!cloudInstances.length" class="m-0 text-secondary">
					Nothing to restore: everything in your account is already on this PC.
				</p>
			</div>

			<!-- Shared setups -->
			<div :class="box" data-test="shared">
				<h3 class="m-0 text-base font-semibold text-contrast">Share a setup</h3>
				<div class="flex gap-2">
					<select v-model="shareChoice" :class="input">
						<option v-for="i in localInstances" :key="i.id" :value="i.id">{{ i.name }}</option>
					</select>
					<Button color="brand" :disabled="!shareChoice || working === 'share'" @click="share">
						Create code
					</Button>
				</div>
				<div v-if="lastShare" class="flex items-center gap-2">
					<span class="flex-1 text-contrast">Code: {{ lastShare.code }}</span>
					<Button @click="copy(lastShare.link)">Copy link</Button>
				</div>
				<div v-for="s in mySharedSetups" :key="s.code" class="flex items-center gap-2">
					<span class="flex-1 text-secondary">{{ s.name }} · {{ s.code }}</span>
					<Button @click="run('d', () => deleteMyShare(s.code))">Delete</Button>
				</div>
				<div class="flex gap-2">
					<input v-model="importCode" :class="input" placeholder="Paste a share code or link" />
					<Button color="brand" :disabled="!importCode.trim() || working === 'import'" @click="doImport">
						{{ working === 'import' ? 'Adding...' : 'Add setup' }}
					</Button>
				</div>
			</div>

			<!-- Skins -->
			<div :class="box" data-test="skins">
				<h3 class="m-0 text-base font-semibold text-contrast">Skins</h3>
				<p class="m-0 text-secondary">
					Your saved skins are kept in your account.
					<span v-if="cloudSkinCount">{{ cloudSkinCount }} not on this PC yet.</span>
				</p>
				<Button v-if="cloudSkinCount" color="brand" :disabled="working === 'skins'" @click="restoreSkins">
					Restore {{ cloudSkinCount }} skin{{ cloudSkinCount === 1 ? '' : 's' }}
				</Button>
			</div>
		</template>
	</div>
</template>
