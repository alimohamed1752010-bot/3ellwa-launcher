import type { UserPreferencesContext } from '@modrinth/ui'

import { get_space_preferences, patch_space_preferences } from '@/helpers/space_sync.ts'

type UserPreferences = NonNullable<UserPreferencesContext['preferences']['value']>
type PartialUserPreferences = Parameters<UserPreferencesContext['updatePreferences']>[0]

// Preferences now live in the 3ellwa Space account (the user id is not needed).
export async function get_user_preferences(_userId: string): Promise<UserPreferences> {
	return await get_space_preferences()
}

export async function patch_user_preferences(
	_userId: string,
	preferences: PartialUserPreferences,
): Promise<UserPreferences> {
	return await patch_space_preferences(preferences)
}
