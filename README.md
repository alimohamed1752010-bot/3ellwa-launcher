# 3ellwa Space

A free Minecraft launcher for friends. No ads, no paid tiers, every mod you already know.

3ellwa Space is a fork of the open-source [Modrinth App](https://github.com/modrinth/code), rebranded and extended with an optional **3ellwa account** (sign in with Discord at [3ellwa.space](https://3ellwa.space)) that syncs your settings, instances and skins, adds friends and share codes, and shows "Playing 3ellwa Space" on Discord.

- Download: https://3ellwa.space/download
- Privacy: https://3ellwa.space/privacy (what the account stores, and how to delete it)
- Not affiliated with Mojang, Microsoft or Modrinth. Mods and modpacks are still downloaded from Modrinth's public library.

## Build it yourself (Windows)

Needs Node 24+, pnpm, Rust (the toolchain in `rust-toolchain.toml`), the Visual Studio C++ build tools and a JDK 17 or newer.

```
pnpm install
cp packages/app-lib/.env.prod packages/app-lib/.env
pnpm app:dev                      # development window
cd apps/app
pnpm tauri build --config tauri-release.conf.json --bundles nsis   # installer
```

Release builds are signed for the updater with a private key that is not in this repository.

## Where things are

- `apps/app` and `apps/app-frontend`: the desktop app (Tauri 2, Rust and Vue)
- `apps/app/src/api/space_account.rs` and `apps/app-frontend/src/helpers/space_*.ts`: the 3ellwa account (sign-in, sync, friends, share codes)
- `packages/app-lib`: the launcher core
- The account server (Cloudflare Worker) lives in a separate repository: `3ellwa-space-site`

## License

AGPL-3.0, same as the Modrinth App it is based on. See `COPYING.md`. Modrinth's name and logo are not part of this license and are not used here.
