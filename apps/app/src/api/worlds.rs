use crate::api::Result;
use either::Either;
use enumset::EnumSet;
use tauri::{AppHandle, Manager, Runtime};
use theseus::instance::{self, QuickPlayType, get_full_path};
use theseus::prelude::ProcessMetadata;
use theseus::server_address::ServerAddress;
use theseus::worlds;
use theseus::worlds::{
    DisplayStatus, ProtocolVersion, ServerPackStatus, ServerStatus, World,
    WorldBackup, WorldType, WorldWithInstance,
};

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("worlds")
        .invoke_handler(tauri::generate_handler![
            get_recent_worlds,
            get_instance_worlds,
            get_singleplayer_world,
            set_world_display_status,
            rename_world,
            reset_world_icon,
            backup_world,
            world_backup_create,
            world_backup_list,
            world_backup_restore,
            world_backup_delete,
            world_backup_prune,
            delete_world,
            add_server_to_instance,
            ensure_managed_server_in_instance,
            edit_server_in_instance,
            remove_server_from_instance,
            desync_server,
            get_instance_protocol_version,
            get_server_status,
            start_join_singleplayer_world,
            start_join_server,
        ])
        .build()
}

#[tauri::command]
pub async fn get_recent_worlds<R: Runtime>(
    app_handle: AppHandle<R>,
    limit: usize,
    display_statuses: Option<EnumSet<DisplayStatus>>,
) -> Result<Vec<WorldWithInstance>> {
    let mut result = worlds::get_recent_worlds(
        limit,
        display_statuses.unwrap_or(EnumSet::all()),
    )
    .await?;
    for world in &mut result {
        adapt_world_icon(&app_handle, &mut world.world);
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_instance_worlds<R: Runtime>(
    app_handle: AppHandle<R>,
    instance_id: &str,
) -> Result<Vec<World>> {
    let mut result = worlds::get_instance_worlds(instance_id).await?;
    for world in &mut result {
        adapt_world_icon(&app_handle, world);
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_singleplayer_world<R: Runtime>(
    app_handle: AppHandle<R>,
    instance: &str,
    world: &str,
) -> Result<World> {
    let mut world = worlds::get_singleplayer_world(instance, world).await?;
    adapt_world_icon(&app_handle, &mut world);
    Ok(world)
}

fn adapt_world_icon<R: Runtime>(app_handle: &AppHandle<R>, world: &mut World) {
    if let Some(Either::Left(icon_path)) = &world.icon {
        let icon_path = icon_path.clone();
        if let Ok(new_url) = super::utils::tauri_convert_file_src(&icon_path) {
            world.icon = Some(Either::Right(new_url));
            if let Err(e) =
                app_handle.asset_protocol_scope().allow_file(&icon_path)
            {
                tracing::warn!(
                    "Failed to allow file access for icon {}: {}",
                    icon_path.display(),
                    e
                );
            }
        } else {
            tracing::warn!(
                "Encountered invalid icon path for world {}: {}",
                world.name,
                icon_path.display()
            );
            world.icon = None;
        }
    }
}

#[tauri::command]
pub async fn set_world_display_status(
    instance: &str,
    world_type: WorldType,
    world_id: &str,
    display_status: DisplayStatus,
) -> Result<()> {
    Ok(worlds::set_world_display_status(
        instance,
        world_type,
        world_id,
        display_status,
    )
    .await?)
}

#[tauri::command]
pub async fn rename_world(
    instance: &str,
    world: &str,
    new_name: &str,
) -> Result<()> {
    let instance = get_full_path(instance).await?;
    worlds::rename_world(&instance, world, new_name).await?;
    Ok(())
}

#[tauri::command]
pub async fn reset_world_icon(instance: &str, world: &str) -> Result<()> {
    let instance = get_full_path(instance).await?;
    worlds::reset_world_icon(&instance, world).await?;
    Ok(())
}

#[tauri::command]
pub async fn backup_world(instance: &str, world: &str) -> Result<u64> {
    let instance = get_full_path(instance).await?;
    Ok(worlds::backup_world(&instance, world).await?)
}

/// Where an instance's world backups live: `<instance>/backups` by default, or
/// `<backups_root>/<instance id>` when the player picked their own folder.
async fn world_backups_dir(
    instance: &str,
    backups_root: Option<&str>,
) -> Result<std::path::PathBuf> {
    match backups_root.filter(|root| !root.trim().is_empty()) {
        Some(root) => {
            let root = std::path::PathBuf::from(root);
            if !root.is_absolute() {
                return Err(anyhow::anyhow!(
                    "The backup folder must be a full path"
                )
                .into());
            }
            let folder: String = instance
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect();
            Ok(root.join(folder))
        }
        None => Ok(get_full_path(instance).await?.join("backups")),
    }
}

#[tauri::command]
pub async fn world_backup_create(
    instance: &str,
    world: &str,
    auto: bool,
    backups_root: Option<String>,
) -> Result<WorldBackup> {
    let dir = world_backups_dir(instance, backups_root.as_deref()).await?;
    let instance_path = get_full_path(instance).await?;
    Ok(worlds::create_world_backup(&instance_path, world, &dir, auto).await?)
}

#[tauri::command]
pub async fn world_backup_list(
    instance: &str,
    backups_root: Option<String>,
) -> Result<Vec<WorldBackup>> {
    let dir = world_backups_dir(instance, backups_root.as_deref()).await?;
    Ok(worlds::list_world_backups(&dir).await?)
}

#[tauri::command]
pub async fn world_backup_restore(
    instance: &str,
    file_name: &str,
    backups_root: Option<String>,
) -> Result<Option<WorldBackup>> {
    let dir = world_backups_dir(instance, backups_root.as_deref()).await?;
    let instance_path = get_full_path(instance).await?;
    Ok(worlds::restore_world_backup(&instance_path, &dir, file_name).await?)
}

#[tauri::command]
pub async fn world_backup_delete(
    instance: &str,
    file_name: &str,
    backups_root: Option<String>,
) -> Result<()> {
    let dir = world_backups_dir(instance, backups_root.as_deref()).await?;
    Ok(worlds::delete_world_backup(&dir, file_name).await?)
}

#[tauri::command]
pub async fn world_backup_prune(
    instance: &str,
    world: &str,
    keep: usize,
    backups_root: Option<String>,
) -> Result<usize> {
    let dir = world_backups_dir(instance, backups_root.as_deref()).await?;
    Ok(worlds::prune_world_backups(&dir, world, keep).await?)
}

#[tauri::command]
pub async fn delete_world(instance: &str, world: &str) -> Result<()> {
    let instance = get_full_path(instance).await?;
    worlds::delete_world(&instance, world).await?;
    Ok(())
}

#[tauri::command]
pub async fn add_server_to_instance(
    instance_id: &str,
    name: String,
    address: String,
    pack_status: ServerPackStatus,
    project_id: Option<String>,
    content_kind: Option<String>,
) -> Result<usize> {
    Ok(worlds::add_server_to_instance(
        instance_id,
        name,
        address,
        pack_status,
        project_id,
        content_kind,
    )
    .await?)
}

#[tauri::command]
pub async fn ensure_managed_server_in_instance(
    instance_id: &str,
    name: String,
    address: String,
) -> Result<()> {
    Ok(
        worlds::ensure_managed_server_in_instance(instance_id, name, address)
            .await?,
    )
}

#[tauri::command]
pub async fn edit_server_in_instance(
    instance_id: &str,
    index: usize,
    name: String,
    address: String,
    pack_status: ServerPackStatus,
) -> Result<()> {
    worlds::edit_server_in_instance(
        instance_id,
        index,
        name,
        address,
        pack_status,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_server_from_instance(
    instance_id: &str,
    index: usize,
) -> Result<()> {
    worlds::remove_server_from_instance(instance_id, index).await?;
    Ok(())
}

#[tauri::command]
pub async fn desync_server(
    instance_id: &str,
    server_id: &str,
    mode: theseus::instance::DesyncServerMode,
) -> Result<()> {
    Ok(theseus::instance::desync_server(instance_id, server_id, mode).await?)
}

#[tauri::command]
pub async fn get_instance_protocol_version(
    instance_id: &str,
) -> Result<Option<ProtocolVersion>> {
    Ok(worlds::get_instance_protocol_version(instance_id).await?)
}

#[tauri::command]
pub async fn get_server_status(
    address: &str,
    protocol_version: Option<ProtocolVersion>,
) -> Result<ServerStatus> {
    Ok(worlds::get_server_status(address, protocol_version).await?)
}

#[tauri::command]
pub async fn start_join_singleplayer_world(
    instance_id: &str,
    world: String,
) -> Result<ProcessMetadata> {
    let process =
        instance::run(instance_id, QuickPlayType::Singleplayer(world)).await?;

    Ok(process)
}

#[tauri::command]
pub async fn start_join_server(
    instance_id: &str,
    address: &str,
) -> Result<ProcessMetadata> {
    let process = instance::run(
        instance_id,
        QuickPlayType::Server(ServerAddress::Unresolved(address.to_owned())),
    )
    .await?;

    Ok(process)
}
