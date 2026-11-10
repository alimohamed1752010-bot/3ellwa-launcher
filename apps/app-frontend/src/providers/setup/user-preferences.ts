import {
	type AbstractWebNotificationManager,
	type AuthProvider,
	setupUserPreferencesProvider,
} from '@modrinth/ui'
import { computed, ref, watchEffect } from 'vue'

import { refreshSpaceAccount, spaceAccount } from '@/helpers/space_account.ts'
import { get_user_preferences, patch_user_preferences } from '@/helpers/user-preferences.ts'

/** Preferences follow the 3ellwa Space account, not the (removed) Modrinth sign-in. */
function spaceAuthProvider(base: AuthProvider): AuthProvider {
	void refreshSpaceAccount()
	const user = ref<AuthProvider['user']['value']>(null)
	watchEffect(() => {
		const account = spaceAccount.value
		user.value = account
			? ({ id: account.user.id, username: account.user.username ?? '' } as unknown as NonNullable<
					AuthProvider['user']['value']
				>)
			: null
	})
	return { ...base, user, isReady: computed(() => true) }
}

export function setupAppUserPreferencesProvider(
	auth: AuthProvider,
	notificationManager: AbstractWebNotificationManager,
) {
	return setupUserPreferencesProvider({
		auth: spaceAuthProvider(auth),
		getPreferences: get_user_preferences,
		patchPreferences: patch_user_preferences,
		notificationManager,
	})
}
