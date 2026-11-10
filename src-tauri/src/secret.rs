use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn init(dir: &Path) {
    let _ = std::fs::create_dir_all(dir);
    let _ = ROOT.set(dir.to_path_buf());
}

pub fn has(service: &str, account: &str) -> Result<bool, String> {
    Ok(get(service, account)?.is_some_and(|value| !value.trim().is_empty()))
}

pub fn get(service: &str, account: &str) -> Result<Option<String>, String> {
    #[cfg(not(target_os = "android"))]
    {
        let entry = keyring::Entry::new(service, account).map_err(|err| err.to_string())?;
        match entry.get_password() {
            Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
            Ok(_) => Ok(None),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }
    #[cfg(target_os = "android")]
    {
        let _ = service;
        match std::fs::read_to_string(file_path(account)?) {
            Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
            Ok(_) => Ok(None),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }
}

pub fn set(service: &str, account: &str, value: &str) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    {
        let entry = keyring::Entry::new(service, account).map_err(|err| err.to_string())?;
        if value.trim().is_empty() {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(err) => Err(err.to_string()),
            }
        } else {
            entry.set_password(value.trim()).map_err(|err| err.to_string())
        }
    }
    #[cfg(target_os = "android")]
    {
        let _ = service;
        let path = file_path(account)?;
        if value.trim().is_empty() {
            match std::fs::remove_file(&path) {
                Ok(()) => Ok(()),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(err) => Err(err.to_string()),
            }
        } else {
            std::fs::write(path, value.trim()).map_err(|err| err.to_string())
        }
    }
}

#[cfg(target_os = "android")]
fn file_path(account: &str) -> Result<PathBuf, String> {
    let root = ROOT.get().ok_or("凭据目录还没有准备好")?;
    std::fs::create_dir_all(root).map_err(|err| err.to_string())?;
    let safe: String = account
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect();
    Ok(root.join(format!("{safe}.secret")))
}
