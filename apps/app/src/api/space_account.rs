//! 3ellwa Space account sign-in (optional; Discord via https://3ellwa.space).
//! Desktop flow: loopback listener + PKCE (RFC 8252). The token is kept in
//! `3ellwa-account.json` in the app data folder.

use crate::api::Result;
use anyhow::{Context, anyhow};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tauri::Runtime;
use tauri::plugin::TauriPlugin;
use tauri_plugin_opener::OpenerExt;
use theseus::prelude::tcp_listen_any_loopback;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SERVER: &str = "https://3ellwa.space";
const FILE_NAME: &str = "3ellwa-account.json";
const WAIT_SECS: u64 = 300;

#[derive(Serialize, Deserialize, Clone)]
struct Stored {
    token: String,
    user: serde_json::Value,
}

#[derive(Serialize)]
pub struct SpaceAccount {
    pub user: serde_json::Value,
}

pub fn init<R: tauri::Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("space-account")
        .invoke_handler(tauri::generate_handler![
            space_account_get,
            space_account_sign_in,
            space_account_sign_out,
            space_account_request,
            space_store_get,
            space_store_set,
        ])
        .build()
}

fn file_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("could not find the app data folder")?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(FILE_NAME))
}

fn read_stored<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<Stored> {
    let path = file_path(app).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn http() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("3ellwa-space-launcher")
        .build()
        .context("could not build http client")?)
}

#[tauri::command]
pub async fn space_account_get<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<SpaceAccount>> {
    Ok(read_stored(&app).map(|s| SpaceAccount { user: s.user }))
}

#[tauri::command]
pub async fn space_account_sign_in<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<SpaceAccount> {
    // PKCE
    let mut raw = [0u8; 64];
    rand::rng().fill_bytes(&mut raw);
    let verifier = URL_SAFE_NO_PAD.encode(raw);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    let listener = tcp_listen_any_loopback()
        .await
        .context("could not open a local port for sign-in")?;
    let port = listener.local_addr().context("no local port")?.port();

    let url = format!("{SERVER}/login?challenge={challenge}&port={port}");
    app.opener()
        .open_url(url, None::<&str>)
        .context("could not open the browser")?;

    let code = tokio::time::timeout(Duration::from_secs(WAIT_SECS), async {
        loop {
            let (mut sock, _) = listener.accept().await?;
            let mut buf = vec![0u8; 4096];
            let n = tokio::time::timeout(
                Duration::from_secs(5),
                sock.read(&mut buf),
            )
            .await
            .unwrap_or(Ok(0))?;
            let head = String::from_utf8_lossy(&buf[..n]).to_string();
            let target = head
                .lines()
                .next()
                .and_then(|l| l.strip_prefix("GET "))
                .and_then(|l| l.split(' ').next())
                .unwrap_or("")
                .to_string();
            let code = target
                .strip_prefix("/callback?")
                .and_then(|q| {
                    url::form_urlencoded::parse(q.as_bytes())
                        .find(|(k, _)| k == "code")
                        .map(|(_, v)| v.into_owned())
                })
                .filter(|c| !c.is_empty() && c.len() < 512);
            let (status, body) = if code.is_some() {
                (
                    "200 OK",
                    "<!doctype html><meta charset=utf-8><title>3ellwa Space</title><body style=\"background:#000;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h1 style=\"color:#00aaff\">Signed in</h1><p>You can close this tab and go back to 3ellwa Space.</p></div>",
                )
            } else {
                ("404 Not Found", "Not found")
            };
            let resp = format!(
                "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(resp.as_bytes()).await.ok();
            sock.shutdown().await.ok();
            if let Some(code) = code {
                return Ok::<String, std::io::Error>(code);
            }
        }
    })
    .await
    .map_err(|_| anyhow!("Sign-in timed out. Please try again."))?
    .context("sign-in listener failed")?;

    // Exchange the one-time code for a token
    let body =
        serde_json::json!({ "code": code, "verifier": verifier }).to_string();
    let resp = http()?
        .post(format!("{SERVER}/api/auth/exchange"))
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .context("could not reach 3ellwa.space")?;
    let ok = resp.status().is_success();
    let text = resp.text().await.context("bad reply from 3ellwa.space")?;
    if !ok {
        return Err(anyhow!("3ellwa.space refused the sign-in").into());
    }

    #[derive(Deserialize)]
    struct Exchange {
        token: String,
        user: serde_json::Value,
    }
    let ex: Exchange = serde_json::from_str(&text)
        .context("unexpected reply from 3ellwa.space")?;

    let stored = Stored {
        token: ex.token,
        user: ex.user.clone(),
    };
    std::fs::write(
        file_path(&app)?,
        serde_json::to_string(&stored).context("could not save sign-in")?,
    )
    .context("could not save sign-in")?;

    if let Some(w) = app.get_window("main") {
        w.set_focus().ok();
    }
    Ok(SpaceAccount { user: ex.user })
}

#[tauri::command]
pub async fn space_account_sign_out<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<()> {
    if let Some(s) = read_stored(&app)
        && let Ok(c) = http()
    {
        // best effort: tell the server to end this session
        c.post(format!("{SERVER}/api/auth/logout"))
            .bearer_auth(s.token)
            .send()
            .await
            .ok();
    }
    let path = file_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).ok();
    }
    Ok(())
}

#[derive(Serialize)]
pub struct SpaceReply {
    pub status: u16,
    pub body: String,
}

/// Authenticated request to the 3ellwa.space API. The token never leaves Rust.
#[tauri::command]
pub async fn space_account_request<R: Runtime>(
    app: tauri::AppHandle<R>,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<SpaceReply> {
    if !path.starts_with("/api/") || path.contains("..") {
        return Err(anyhow!("bad path").into());
    }
    let stored = read_stored(&app).ok_or_else(|| anyhow!("not signed in"))?;
    let client = http()?;
    let url = format!("{SERVER}{path}");
    let mut req = match method.as_str() {
        "GET" => client.get(url),
        "PUT" => client.put(url),
        "POST" => client.post(url),
        "DELETE" => client.delete(url),
        _ => return Err(anyhow!("bad method").into()),
    }
    .bearer_auth(stored.token);
    if let Some(b) = body {
        req = req.header("content-type", "application/json").body(b);
    }
    let resp = req.send().await.context("could not reach 3ellwa.space")?;
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    if status == 401 {
        // session expired or revoked: forget it so the UI shows signed out
        if let Ok(p) = file_path(&app) {
            std::fs::remove_file(p).ok();
        }
    }
    Ok(SpaceReply { status, body })
}

const STORE_NAMES: [&str; 2] = ["instance-map", "launcher-prefs"];

fn store_path<R: Runtime>(
    app: &tauri::AppHandle<R>,
    name: &str,
) -> Result<PathBuf> {
    if !STORE_NAMES.contains(&name) {
        return Err(anyhow!("unknown store").into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .context("could not find the app data folder")?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("3ellwa-{name}.json")))
}

/// Small durable key files (shared by the dev and installed app, unlike web storage).
#[tauri::command]
pub async fn space_store_get<R: Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
) -> Result<Option<String>> {
    Ok(std::fs::read_to_string(store_path(&app, &name)?).ok())
}

#[tauri::command]
pub async fn space_store_set<R: Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
    value: String,
) -> Result<()> {
    if value.len() > 2_000_000 {
        return Err(anyhow!("too large").into());
    }
    std::fs::write(store_path(&app, &name)?, value)
        .context("could not save")?;
    Ok(())
}
