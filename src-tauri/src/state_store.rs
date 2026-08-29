use serde::{de::DeserializeOwned, Serialize};
use std::{
    ffi::OsString,
    fmt,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
pub(crate) enum StateStoreError {
    Missing,
    Io(io::Error),
    Json(serde_json::Error),
}

impl fmt::Display for StateStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing => formatter.write_str("state file is missing"),
            Self::Io(error) => write!(formatter, "state file operation failed: {error}"),
            Self::Json(error) => write!(formatter, "state file contains invalid JSON: {error}"),
        }
    }
}

impl std::error::Error for StateStoreError {}

impl From<io::Error> for StateStoreError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for StateStoreError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

pub(crate) fn load_state_from_path<T>(path: &Path) -> Result<T, StateStoreError>
where
    T: DeserializeOwned,
{
    let bytes = read_state_bytes(path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub(crate) fn load_state_with_recovery<T>(path: &Path) -> T
where
    T: Default + DeserializeOwned + Serialize,
{
    match load_state_from_path(path) {
        Ok(state) => state,
        Err(StateStoreError::Missing) => T::default(),
        Err(_) => recover_state_from_backup(path).unwrap_or_default(),
    }
}

pub(crate) fn save_state_to_path<T>(path: &Path, state: &T) -> Result<(), StateStoreError>
where
    T: DeserializeOwned + Serialize,
{
    let data = serde_json::to_vec_pretty(state)?;
    write_state_safely::<T>(path, &data)
}

pub(crate) fn write_state_safely<T>(
    path: &Path,
    serialized_state: &[u8],
) -> Result<(), StateStoreError>
where
    T: DeserializeOwned,
{
    serde_json::from_slice::<T>(serialized_state)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    if let Some(valid_primary) = read_valid_primary_bytes::<T>(path)? {
        write_bytes_safely(&backup_path_for(path), &valid_primary)?;
    }

    write_bytes_safely(path, serialized_state)?;
    Ok(())
}

pub(crate) fn backup_path_for(path: &Path) -> PathBuf {
    let backup_file_name = path
        .file_name()
        .map(|name| {
            let mut backup = OsString::from(name);
            backup.push(".bak");
            backup
        })
        .unwrap_or_else(|| OsString::from("state.json.bak"));
    path.with_file_name(backup_file_name)
}

fn recover_state_from_backup<T>(path: &Path) -> Option<T>
where
    T: DeserializeOwned + Serialize,
{
    let backup_path = backup_path_for(path);
    let recovered = load_state_from_path::<T>(&backup_path).ok()?;
    let _ = save_state_to_path(path, &recovered);
    Some(recovered)
}

fn read_valid_primary_bytes<T>(path: &Path) -> Result<Option<Vec<u8>>, StateStoreError>
where
    T: DeserializeOwned,
{
    match read_state_bytes(path) {
        Ok(bytes) => match serde_json::from_slice::<T>(&bytes) {
            Ok(_) => Ok(Some(bytes)),
            Err(_) => Ok(None),
        },
        Err(StateStoreError::Missing) => Ok(None),
        Err(error) => Err(error),
    }
}

fn read_state_bytes(path: &Path) -> Result<Vec<u8>, StateStoreError> {
    match fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Err(StateStoreError::Missing),
        Err(error) => Err(StateStoreError::Io(error)),
    }
}

fn write_bytes_safely(path: &Path, bytes: &[u8]) -> Result<(), StateStoreError> {
    let parent = path.parent().ok_or_else(|| {
        StateStoreError::Io(io::Error::new(
            io::ErrorKind::InvalidInput,
            "state file path has no parent directory",
        ))
    })?;
    fs::create_dir_all(parent)?;

    let (temp_path, mut temp_file) = create_temp_file(path)?;
    let result = (|| -> io::Result<()> {
        temp_file.write_all(bytes)?;
        temp_file.sync_all()?;
        drop(temp_file);
        replace_with_temp_file(&temp_path, path)
    })();

    match result {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            Err(StateStoreError::Io(error))
        }
    }
}

fn create_temp_file(path: &Path) -> io::Result<(PathBuf, File)> {
    path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "state file path has no parent directory",
        )
    })?;
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    for attempt in 0..100u8 {
        let temp_path = temp_path_for(path, unique, attempt)?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => return Ok((temp_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not create a unique temporary state file",
    ))
}

fn temp_path_for(path: &Path, unique: u128, attempt: u8) -> io::Result<PathBuf> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "state file path has no parent directory",
        )
    })?;
    let file_name = path.file_name().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "state file path has no file name",
        )
    })?;

    let mut temp_name = OsString::from(".");
    temp_name.push(file_name);
    temp_name.push(format!(
        ".{}.{}.{}.tmp",
        std::process::id(),
        unique,
        attempt
    ));
    Ok(parent.join(temp_name))
}

fn replace_with_temp_file(temp_path: &Path, destination_path: &Path) -> io::Result<()> {
    if destination_path.try_exists()? {
        replace_existing_file(temp_path, destination_path)
    } else {
        fs::rename(temp_path, destination_path)
    }
}

#[cfg(windows)]
fn replace_existing_file(temp_path: &Path, destination_path: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;

    let destination = destination_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replacement = temp_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    // SAFETY: the path buffers are valid, null-terminated UTF-16 strings for
    // the duration of the call, and the reserved pointer arguments are null as
    // required by ReplaceFileW.
    let replaced = unsafe {
        ReplaceFileW(
            destination.as_ptr(),
            replacement.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null(),
            std::ptr::null(),
        )
    };

    if replaced == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_existing_file(temp_path: &Path, destination_path: &Path) -> io::Result<()> {
    fs::rename(temp_path, destination_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AppSettings, AppState, EngineeringTask, Project, TaskSessionLink, TaskStatus};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(test_name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "codex-command-center-state-store-{test_name}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create isolated test directory");
            Self { path }
        }

        fn state_path(&self) -> PathBuf {
            self.path.join("state.json")
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn representative_state(suffix: &str) -> AppState {
        AppState {
            projects: vec![Project {
                id: format!("project-{suffix}"),
                name: format!("Project {suffix}"),
                path: format!("C:\\work\\project-{suffix}"),
                created_at: "2026-08-29T01:00:00Z".to_string(),
            }],
            tasks: vec![EngineeringTask {
                id: format!("task-{suffix}"),
                project_id: format!("project-{suffix}"),
                title: format!("Task {suffix}"),
                description: "Improve local state reliability.".to_string(),
                status: TaskStatus::Active,
                created_at: "2026-08-29T01:00:00Z".to_string(),
                updated_at: "2026-08-29T01:01:00Z".to_string(),
                completion_summary: String::new(),
            }],
            links: vec![TaskSessionLink {
                task_id: format!("task-{suffix}"),
                session_id: format!("session-{suffix}"),
            }],
            settings: AppSettings {
                codex_command: "codex".to_string(),
                sessions_root: format!("C:\\Users\\Example\\.codex\\sessions-{suffix}"),
            },
        }
    }

    #[test]
    fn first_save_creates_primary_without_backup() {
        let dir = TestDir::new("first-save");
        let path = dir.state_path();
        let state = representative_state("a");

        save_state_to_path(&path, &state).expect("save first state");

        assert_eq!(load_state_from_path::<AppState>(&path).unwrap(), state);
        assert!(!backup_path_for(&path).exists());
    }

    #[test]
    fn subsequent_save_preserves_previous_primary_in_backup() {
        let dir = TestDir::new("subsequent-save");
        let path = dir.state_path();
        let state_a = representative_state("a");
        let state_b = representative_state("b");

        save_state_to_path(&path, &state_a).expect("save state A");
        save_state_to_path(&path, &state_b).expect("save state B");

        assert_eq!(load_state_from_path::<AppState>(&path).unwrap(), state_b);
        assert_eq!(
            load_state_from_path::<AppState>(&backup_path_for(&path)).unwrap(),
            state_a
        );
    }

    #[test]
    fn load_recovers_from_valid_backup_when_primary_is_corrupt() {
        let dir = TestDir::new("corrupt-primary-recovery");
        let path = dir.state_path();
        let backup_path = backup_path_for(&path);
        let state = representative_state("a");

        fs::write(&path, b"{not valid json").expect("write corrupt primary");
        fs::write(
            &backup_path,
            serde_json::to_vec_pretty(&state).expect("serialize backup"),
        )
        .expect("write valid backup");

        assert_eq!(load_state_with_recovery::<AppState>(&path), state);
        assert_eq!(load_state_from_path::<AppState>(&path).unwrap(), state);
        assert_eq!(
            load_state_from_path::<AppState>(&backup_path).unwrap(),
            representative_state("a")
        );
    }

    #[test]
    fn save_with_corrupt_primary_preserves_valid_backup() {
        let dir = TestDir::new("corrupt-primary-preserve-backup");
        let path = dir.state_path();
        let backup_path = backup_path_for(&path);
        let state_a = representative_state("a");
        let state_b = representative_state("b");

        fs::write(
            &backup_path,
            serde_json::to_vec_pretty(&state_a).expect("serialize backup"),
        )
        .expect("write valid backup");
        fs::write(&path, b"{not valid json").expect("write corrupt primary");

        save_state_to_path(&path, &state_b).expect("save state B over corrupt primary");

        assert_eq!(load_state_from_path::<AppState>(&path).unwrap(), state_b);
        assert_eq!(
            load_state_from_path::<AppState>(&backup_path).unwrap(),
            state_a
        );
    }

    #[test]
    fn load_defaults_when_primary_and_backup_are_invalid() {
        let dir = TestDir::new("both-invalid");
        let path = dir.state_path();
        let backup_path = backup_path_for(&path);

        fs::write(&path, b"{not valid json").expect("write corrupt primary");
        fs::write(&backup_path, b"{also invalid json").expect("write corrupt backup");

        assert_eq!(
            load_state_with_recovery::<AppState>(&path),
            AppState::default()
        );
        assert!(load_state_from_path::<AppState>(&path).is_err());
        assert!(load_state_from_path::<AppState>(&backup_path).is_err());
    }

    #[test]
    fn load_defaults_when_primary_and_backup_are_missing() {
        let dir = TestDir::new("missing-files");
        let path = dir.state_path();

        assert_eq!(
            load_state_with_recovery::<AppState>(&path),
            AppState::default()
        );
        assert!(!path.exists());
        assert!(!backup_path_for(&path).exists());
    }

    #[test]
    fn save_load_round_trips_representative_app_state() {
        let dir = TestDir::new("round-trip");
        let path = dir.state_path();
        let state = representative_state("roundtrip");

        save_state_to_path(&path, &state).expect("save representative state");
        let loaded = load_state_with_recovery::<AppState>(&path);

        assert_eq!(loaded.projects, state.projects);
        assert_eq!(loaded.tasks, state.tasks);
        assert_eq!(loaded.links, state.links);
        assert_eq!(loaded.settings, state.settings);
    }

    #[test]
    fn failed_backup_write_leaves_primary_and_backup_unchanged() {
        let dir = TestDir::new("failed-backup-write");
        let path = dir.state_path();
        let backup_path = backup_path_for(&path);
        let state_a = representative_state("a");
        let state_b = representative_state("b");

        save_state_to_path(&path, &state_a).expect("save state A");
        fs::create_dir(&backup_path).expect("create backup path as directory");

        assert!(save_state_to_path(&path, &state_b).is_err());
        assert_eq!(load_state_from_path::<AppState>(&path).unwrap(), state_a);
        assert!(backup_path.is_dir());
        assert!(fs::read_dir(&dir.path)
            .unwrap()
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().ends_with(".tmp")));
    }

    #[test]
    fn invalid_serialized_state_never_replaces_primary() {
        let dir = TestDir::new("invalid-serialized-state");
        let path = dir.state_path();
        let state = representative_state("a");

        save_state_to_path(&path, &state).expect("save state A");

        assert!(write_state_safely::<AppState>(&path, b"{not valid json").is_err());
        assert_eq!(load_state_from_path::<AppState>(&path).unwrap(), state);
        assert!(!backup_path_for(&path).exists());
        assert!(fs::read_dir(&dir.path)
            .unwrap()
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().ends_with(".tmp")));
    }
}
