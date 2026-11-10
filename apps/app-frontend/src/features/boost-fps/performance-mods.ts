/**
 * Well-known client performance mods on Modrinth, per loader. Each only changes how the game runs,
 * not how it plays, so they are safe to add to almost any instance.
 */
export type PerformanceMod = {
	slug: string
	/** Why it helps, shown in the modal. */
	reason: 'rendering' | 'logic' | 'memory' | 'culling' | 'startup'
	/** Skip this mod when any of these are already installed (they do the same job or clash). */
	conflictsWith?: string[]
}

const RENDERER_CONFLICTS = [
	'optifine',
	'optifabric',
	'embeddium',
	'rubidium',
	'sodium',
	'celeritas',
]

export const PERFORMANCE_MODS: Record<string, PerformanceMod[]> = {
	fabric: [
		{ slug: 'sodium', reason: 'rendering', conflictsWith: RENDERER_CONFLICTS },
		{ slug: 'lithium', reason: 'logic' },
		{ slug: 'ferrite-core', reason: 'memory' },
		{ slug: 'entityculling', reason: 'culling' },
		{ slug: 'immediatelyfast', reason: 'rendering' },
	],
	quilt: [
		{ slug: 'sodium', reason: 'rendering', conflictsWith: RENDERER_CONFLICTS },
		{ slug: 'lithium', reason: 'logic' },
		{ slug: 'ferrite-core', reason: 'memory' },
		{ slug: 'entityculling', reason: 'culling' },
	],
	neoforge: [
		{ slug: 'sodium', reason: 'rendering', conflictsWith: RENDERER_CONFLICTS },
		{ slug: 'ferrite-core', reason: 'memory' },
		{ slug: 'modernfix', reason: 'startup' },
		{ slug: 'entityculling', reason: 'culling' },
	],
	forge: [
		{ slug: 'embeddium', reason: 'rendering', conflictsWith: RENDERER_CONFLICTS },
		{ slug: 'ferrite-core', reason: 'memory' },
		{ slug: 'modernfix', reason: 'startup' },
		{ slug: 'entityculling', reason: 'culling' },
	],
}

/** Recommended maximum memory in MB for a modded instance, given total system memory in MB. */
export function recommendedMemoryMb(totalMb: number): number {
	if (!totalMb) return 4096
	const target = totalMb >= 16384 ? 6144 : totalMb >= 8192 ? 4096 : 3072
	return Math.min(target, Math.floor((totalMb * 0.5) / 512) * 512)
}
