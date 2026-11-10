/**
 * Reads a Minecraft log / crash report and works out, in plain terms, why the game crashed.
 * Pure string matching, no app imports, so it can be tested on its own.
 */

export type CrashCause =
	| { kind: 'out-of-memory' }
	| { kind: 'wrong-java'; needed: number | null }
	| { kind: 'missing-dependency'; mod: string | null; missing: string[] }
	| { kind: 'incompatible-mods'; mods: string[] }
	| { kind: 'duplicate-mod'; mods: string[] }
	| { kind: 'mixin-failure'; mods: string[] }
	| { kind: 'graphics-driver' }
	| { kind: 'mod-error'; mods: string[]; error: string | null }
	| { kind: 'unknown'; error: string | null }

/** True when the text shows the game actually crashed (not just closed or stopped by the player). */
export function looksLikeCrash(text: string): boolean {
	return CRASH_MARKERS.some((marker) => marker.test(text))
}

const CRASH_MARKERS = [
	/---- Minecraft Crash Report ----/,
	/#@!@# Game crashed!/,
	/Exception in thread "(main|Render thread)"/,
	/java\.lang\.OutOfMemoryError/,
	/UnsupportedClassVersionError/,
	/Incompatible mods? (found|set)/i,
	/Mod resolution (failed|encountered an incompatible mod set)/i,
	/Missing or unsupported mandatory dependencies/i,
	/Found duplicate mods?/i,
	/Duplicate mods? found/i,
	/Mixin apply (for mod \S+ )?failed/i,
	/MixinApplyError|InvalidMixinException|MixinTransformerError/,
	/Pixel format not accelerated/i,
	/GLFW error (65542|65543)/,
	/\[(main|Render thread)\/FATAL\]/,
	/Failed to start the minecraft server/i,
	/A fatal error has been detected by the Java Runtime Environment/,
]

const unique = (items: (string | null | undefined)[]) => [
	...new Set(
		items.filter((item): item is string => !!item && item.trim().length > 0).map((s) => s.trim()),
	),
]

function all(text: string, pattern: RegExp, group = 1): string[] {
	const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
	return unique([...text.matchAll(new RegExp(pattern.source, flags))].map((m) => m[group]))
}

/** The last "Caused by"/exception line, shortened, for the details box. */
function lastError(text: string): string | null {
	const lines = text.split(/\r?\n/)
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim()
		if (/^(Caused by: )?[a-z][\w$.]*(Exception|Error)\b(:|$)/.test(line)) {
			return line.replace(/^Caused by: /, '').slice(0, 300)
		}
	}
	return null
}

/** Loaders and shared libraries that show up in almost every crash; disabling them breaks everything. */
const CORE_LIBRARIES =
	/^(None|Minecraft|Java|NeoForge|Forge|Fabric( API| Loader)?|Quilt( Loader)?|Quilted Fabric API|Mixin(Extras)?|Architectury( API)?|Cloth Config( API)?)$/i

/** Java class file major version -> Java release (52 = Java 8). */
const classVersionToJava = (major: number) => major - 44

export function analyzeCrash(text: string): CrashCause {
	if (/java\.lang\.OutOfMemoryError|There is insufficient memory for the Java Runtime/.test(text)) {
		return { kind: 'out-of-memory' }
	}

	const classVersion = text.match(
		/compiled by a more recent version of the Java Runtime \(class file version (\d+)/,
	)
	if (classVersion || /UnsupportedClassVersionError/.test(text)) {
		return {
			kind: 'wrong-java',
			needed: classVersion ? classVersionToJava(Number(classVersion[1])) : null,
		}
	}
	const javaRequired = text.match(/requires (?:Java|java) (\d+)(?: or (?:above|later|newer))?/)
	if (javaRequired && /(Incompatible|java version)/i.test(text)) {
		return { kind: 'wrong-java', needed: Number(javaRequired[1]) }
	}

	// Fabric / Quilt: "- Mod 'Sodium' (sodium) 0.5.8 requires any version of fabric-api, which is missing!"
	const fabricMissing = [
		...text.matchAll(
			/Mod '([^']+)' \(([\w-]+)\)[^\n]*?requires (?:any version|version [^\n]*?) of (?:mod )?'?([^',!\n]+?)'?(?: \([\w-]+\))?,? which is missing/gi,
		),
	]
	if (fabricMissing.length) {
		return {
			kind: 'missing-dependency',
			mod: fabricMissing[0][1],
			missing: unique(fabricMissing.map((m) => m[3])),
		}
	}
	// Forge / NeoForge: "Mod ID: 'geckolib', Requested by: 'mowziesmobs', Expected range: ..."
	if (/Missing or unsupported mandatory dependencies/i.test(text)) {
		const ids = [...text.matchAll(/Mod ID: '([\w-]+)', Requested by: '([\w-]+)'/g)]
		return {
			kind: 'missing-dependency',
			mod: ids[0]?.[2] ?? null,
			missing: unique(ids.map((m) => m[1])),
		}
	}

	if (/Found duplicate mods?|Duplicate mods? found|DuplicateModsFoundException/i.test(text)) {
		return {
			kind: 'duplicate-mod',
			mods: unique([
				...all(text, /Mod ID '([\w-]+)' from mod files/),
				...all(text, /duplicate (?:mod|mods)[^\n]*?'([\w-]+)'/i),
				...all(text, /\t- Mod '([^']+)' \([\w-]+\)[^\n]*\n[^\n]*duplicate/i),
			]),
		}
	}

	if (
		/Incompatible mods? (found|set)|Mod resolution encountered an incompatible mod set/i.test(text)
	) {
		return {
			kind: 'incompatible-mods',
			mods: unique([
				...all(text, /Mod '([^']+)' \([\w-]+\)[^\n]*is incompatible with/i),
				...all(
					text,
					/is incompatible with (?:any version of )?(?:mod )?'?([^',\n]+?)'?(?: \(|,|$)/im,
				),
				...all(text, /Remove mod '([^']+)'/i),
			]),
		}
	}

	if (
		/Mixin apply (for mod \S+ )?failed|MixinApplyError|InvalidMixinException|MixinTransformerError/.test(
			text,
		)
	) {
		return {
			kind: 'mixin-failure',
			mods: unique([
				...all(text, /Mixin apply for mod ([\w-]+) failed/),
				...all(text, /from mod ([\w-]+)(?:\]|\s|$)/),
				...all(text, /\[([\w-]+)\.mixins\.json/),
			]).slice(0, 5),
		}
	}

	if (
		/Pixel format not accelerated|GLFW error (65542|65543)|WGL: The driver does not appear to support OpenGL|Couldn't set pixel format/i.test(
			text,
		)
	) {
		return { kind: 'graphics-driver' }
	}

	const suspects = unique([
		...all(text, /Suspected Mods?:\s*([^\n]+)/i)
			.flatMap((line) => line.split(','))
			.map((name) => name.replace(/\(.*$/, '').trim())
			.filter((name) => !CORE_LIBRARIES.test(name)),
		...all(text, /^\s*-\s*Mod '([^']+)'[^\n]*\n?/im).filter(() => /Suspected mods/i.test(text)),
	])
	if (suspects.length) {
		return { kind: 'mod-error', mods: suspects.slice(0, 5), error: lastError(text) }
	}

	return { kind: 'unknown', error: lastError(text) }
}
