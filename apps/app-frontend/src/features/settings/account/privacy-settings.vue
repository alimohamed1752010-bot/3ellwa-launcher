<script setup lang="ts">
import { Settings2Icon } from '@modrinth/assets'
import {
	Button,
	defineMessages,
	injectNotificationManager,
	injectPageContext,
	Toggle,
	useVIntl,
} from '@modrinth/ui'
import { ref, watch } from 'vue'

import { open_ads_consent_preferences } from '@/helpers/ads.js'
import { optInAnalytics, optOutAnalytics } from '@/helpers/analytics'
import { get, set } from '@/helpers/settings.ts'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { adConsentAvailable } = injectPageContext()
const settings = ref(await get())

const messages = defineMessages({
	adsConsentTitle: {
		id: 'app.ads-consent.title',
		defaultMessage: 'Your privacy and how ads support 3ellwa Space',
	},
	adsConsentIntro: {
		id: 'app.settings.privacy.ads-consent.intro',
		defaultMessage:
			'Ads make 3ellwa Space possible and fund creator payouts. Our partners may store or access cookies in the app to personalize ads and measure performance. You can opt out or manage your preferences below.',
	},
	adsConsentManage: {
		id: 'app.ads-consent.manage',
		defaultMessage: 'Manage preferences',
	},
	telemetryTitle: {
		id: 'app.settings.privacy.telemetry.title',
		defaultMessage: 'Telemetry',
	},
	telemetryDescription: {
		id: 'app.settings.privacy.telemetry.description',
		defaultMessage:
			'3ellwa Space does not collect analytics or usage data. This option has no effect in this build.',
	},
	discordRichPresenceTitle: {
		id: 'app.settings.privacy.discord-rich-presence.title',
		defaultMessage: 'Discord Rich Presence',
	},
	discordRichPresenceDescription: {
		id: 'app.settings.privacy.discord-rich-presence.description',
		defaultMessage:
			'Show 3ellwa Space as your current activity on Discord. This does not affect Rich Presence added to instances by mods. Requires an app restart.',
	},
})

async function manageAdsPreferences() {
	await open_ads_consent_preferences().catch(handleError)
}

watch(
	settings,
	async () => {
		if (settings.value.telemetry) {
			optInAnalytics()
		} else {
			optOutAnalytics()
		}

		await set(settings.value)
	},
	{ deep: true },
)
</script>

<template>
	<div class="mt-8 first:mt-0 flex items-center justify-between gap-4">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.telemetryTitle) }}
			</h2>
			<p class="m-0 mt-1">
				{{ formatMessage(messages.telemetryDescription) }}
			</p>
		</div>
		<Toggle id="opt-out-analytics" v-model="settings.telemetry" />
	</div>

	<div class="mt-4 flex items-center justify-between gap-4">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.discordRichPresenceTitle) }}
			</h2>
			<p class="m-0 mt-1">
				{{ formatMessage(messages.discordRichPresenceDescription) }}
			</p>
		</div>
		<Toggle id="disable-discord-rpc" v-model="settings.discord_rpc" />
	</div>
</template>
