use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppState {
    projects: Vec<Project>,
    tasks: Vec<EngineeringTask>,
    links: Vec<TaskSessionLink>,
    settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    path: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineeringTask {
    id: String,
    project_id: String,
    title: String,
    description: String,
    status: TaskStatus,
    created_at: String,
    updated_at: String,
    completion_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
enum TaskStatus {
    Planned,
    Active,
    Completed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskSessionLink {
    task_id: String,
    session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    codex_command: String,
    sessions_root: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_command: "codex".to_string(),
            sessions_root: default_sessions_root()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexSession {
    id: String,
    file_path: String,
    project_path: String,
    created_at: String,
    last_activity: String,
    title: String,
    model: String,
    line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitStatus {
    project_id: String,
    path: String,
    exists: bool,
    is_git_repo: bool,
    branch: String,
    changed: Vec<GitFileChange>,
    error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitFileChange {
    path: String,
    status: String,
    staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexEnvironment {
    cli_found: bool,
    cli_path: String,
    cli_version: String,
    config_files: Vec<ConfigFileSummary>,
    skills: Vec<InventoryItem>,
    mcp_servers: Vec<McpServerSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFileSummary {
    path: String,
    exists: bool,
    redacted_preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InventoryItem {
    name: String,
    location: String,
    available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpServerSummary {
    name: String,
    command_type: String,
    configured: bool,
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitialData {
    state: AppState,
    sessions: Vec<CodexSession>,
    environment: CodexEnvironment,
    git: Vec<GitStatus>,
}

#[tauri::command]
fn get_initial_data() -> Result<InitialData, String> {
    let state = load_state();
    let sessions = index_sessions_inner(&state.settings.sessions_root)?;
    let environment =
        inspect_environment_inner(&state.settings.codex_command, &state.settings.sessions_root);
    let git = state.projects.iter().map(project_git_status).collect();
    Ok(InitialData {
        state,
        sessions,
        environment,
        git,
    })
}

#[tauri::command]
fn save_app_state(state: AppState) -> Result<(), String> {
    let path = state_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn index_sessions(sessions_root: String) -> Result<Vec<CodexSession>, String> {
    index_sessions_inner(&sessions_root)
}

#[tauri::command]
fn inspect_environment(codex_command: String, sessions_root: String) -> CodexEnvironment {
    inspect_environment_inner(&codex_command, &sessions_root)
}

#[tauri::command]
fn get_git_status(project: Project) -> GitStatus {
    project_git_status(&project)
}

#[tauri::command]
fn get_git_diff(path: String, file_path: String, staged: bool) -> Result<String, String> {
    if !Path::new(&path).exists() {
        return Err("The selected project directory no longer exists.".to_string());
    }
    let mut args = vec!["-C", &path, "diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&file_path);
    run_git(&args)
}

#[tauri::command]
fn stage_file(path: String, file_path: String) -> Result<(), String> {
    run_git(&["-C", &path, "add", "--", &file_path]).map(|_| ())
}

#[tauri::command]
fn unstage_file(path: String, file_path: String) -> Result<(), String> {
    run_git(&["-C", &path, "restore", "--staged", "--", &file_path]).map(|_| ())
}

#[tauri::command]
fn commit_changes(path: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message is required.".to_string());
    }
    run_git(&["-C", &path, "commit", "-m", message.trim()])
}

#[tauri::command]
fn launch_codex_resume(
    codex_command: String,
    cwd: String,
    session_id: String,
) -> Result<(), String> {
    launch_codex(&codex_command, &cwd, &["resume", &session_id])
}

#[tauri::command]
fn launch_codex_new(codex_command: String, cwd: String, prompt: String) -> Result<(), String> {
    if prompt.trim().is_empty() {
        launch_codex(&codex_command, &cwd, &[])
    } else {
        launch_codex(&codex_command, &cwd, &[prompt.trim()])
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_initial_data,
            save_app_state,
            index_sessions,
            inspect_environment,
            get_git_status,
            get_git_diff,
            stage_file,
            unstage_file,
            commit_changes,
            launch_codex_resume,
            launch_codex_new
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Codex Command Center");
}

fn load_state() -> AppState {
    let Ok(path) = state_file_path() else {
        return AppState::default();
    };
    let Ok(bytes) = fs::read(path) else {
        return AppState::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn state_file_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .ok_or_else(|| "Could not find a local application data directory.".to_string())?;
    Ok(base.join("CodexCommandCenter").join("state.json"))
}

fn default_sessions_root() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".codex").join("sessions"))
}

fn index_sessions_inner(sessions_root: &str) -> Result<Vec<CodexSession>, String> {
    let root = if sessions_root.trim().is_empty() {
        default_sessions_root().unwrap_or_default()
    } else {
        PathBuf::from(sessions_root)
    };
    if !root.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();
    for entry in WalkDir::new(&root).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !entry.file_type().is_file()
            || path.extension().and_then(|s| s.to_str()) != Some("jsonl")
        {
            continue;
        }
        if let Some(session) = parse_session_file(path) {
            sessions.push(session);
        }
    }
    sessions.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
    Ok(sessions)
}

fn parse_session_file(path: &Path) -> Option<CodexSession> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let metadata = fs::metadata(path).ok();
    let mut created_at = metadata
        .as_ref()
        .and_then(|m| m.created().ok())
        .map(format_system_time)
        .unwrap_or_default();
    let mut last_activity = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .map(format_system_time)
        .unwrap_or_default();
    let mut project_path = String::new();
    let mut title = String::new();
    let mut model = String::new();
    let mut line_count = 0usize;

    for line in reader.lines().map_while(Result::ok) {
        line_count += 1;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            if created_at.is_empty() {
                created_at = find_string_by_keys(&value, &["timestamp", "created_at", "createdAt"])
                    .unwrap_or_default();
            }
            if let Some(ts) = find_string_by_keys(&value, &["timestamp", "created_at", "createdAt"])
            {
                last_activity = ts;
            }
            if project_path.is_empty() {
                project_path = find_string_by_keys(&value, &["cwd", "current_working_directory"])
                    .unwrap_or_default();
            }
            if title.is_empty() {
                title = find_first_user_text(&value).unwrap_or_default();
            }
            if model.is_empty() {
                model = find_string_by_keys(&value, &["model"]).unwrap_or_default();
            }
        }
    }

    let id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown-session")
        .to_string();

    Some(CodexSession {
        id: id.clone(),
        file_path: path.to_string_lossy().to_string(),
        project_path,
        created_at,
        last_activity,
        title: if title.is_empty() {
            id
        } else {
            clean_title(&title)
        },
        model,
        line_count,
    })
}

fn find_string_by_keys(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(Value::String(s)) = map.get(*key) {
                    return Some(s.clone());
                }
            }
            for child in map.values() {
                if let Some(found) = find_string_by_keys(child, keys) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items.iter().find_map(|v| find_string_by_keys(v, keys)),
        _ => None,
    }
}

fn find_first_user_text(value: &Value) -> Option<String> {
    if let Value::Object(map) = value {
        let role = map.get("role").and_then(Value::as_str);
        if role == Some("user") {
            if let Some(text) = find_string_by_keys(value, &["text", "content", "message"]) {
                return Some(text);
            }
        }
        if map.get("type").and_then(Value::as_str) == Some("message") {
            if let Some(text) = find_string_by_keys(value, &["text", "content"]) {
                return Some(text);
            }
        }
        for child in map.values() {
            if let Some(found) = find_first_user_text(child) {
                return Some(found);
            }
        }
    } else if let Value::Array(items) = value {
        for item in items {
            if let Some(found) = find_first_user_text(item) {
                return Some(found);
            }
        }
    }
    None
}

fn clean_title(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > 96 {
        collapsed.chars().take(96).collect::<String>() + "..."
    } else {
        collapsed
    }
}

fn format_system_time(time: SystemTime) -> String {
    match time.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs().to_string(),
        Err(_) => String::new(),
    }
}

fn project_git_status(project: &Project) -> GitStatus {
    let path = Path::new(&project.path);
    if !path.exists() {
        return GitStatus {
            project_id: project.id.clone(),
            path: project.path.clone(),
            exists: false,
            is_git_repo: false,
            branch: String::new(),
            changed: vec![],
            error: "The selected project directory no longer exists.".to_string(),
        };
    }

    let branch = match run_git(&["-C", &project.path, "branch", "--show-current"]) {
        Ok(out) => out.trim().to_string(),
        Err(error) => {
            return GitStatus {
                project_id: project.id.clone(),
                path: project.path.clone(),
                exists: true,
                is_git_repo: false,
                branch: String::new(),
                changed: vec![],
                error,
            }
        }
    };

    let porcelain = run_git(&["-C", &project.path, "status", "--porcelain"]).unwrap_or_default();
    let changed = porcelain
        .lines()
        .filter_map(parse_git_porcelain_line)
        .collect();
    GitStatus {
        project_id: project.id.clone(),
        path: project.path.clone(),
        exists: true,
        is_git_repo: true,
        branch,
        changed,
        error: String::new(),
    }
}

fn parse_git_porcelain_line(line: &str) -> Option<GitFileChange> {
    if line.len() < 4 {
        return None;
    }
    let x = line.chars().next().unwrap_or(' ');
    let status = line[..2].trim().to_string();
    let path = line[3..].to_string();
    Some(GitFileChange {
        path,
        status: if status.is_empty() {
            "Modified".to_string()
        } else {
            status
        },
        staged: x != ' ' && x != '?',
    })
}

fn run_git(args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .output()
        .map_err(|_| "Git was not found or could not be started.".to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "This directory is not a Git repository.".to_string()
        } else {
            stderr
        })
    }
}

fn inspect_environment_inner(codex_command: &str, _sessions_root: &str) -> CodexEnvironment {
    let command = if codex_command.trim().is_empty() {
        "codex"
    } else {
        codex_command.trim()
    };
    let cli_path = which::which(command)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let cli_found = !cli_path.is_empty();
    let cli_version = if cli_found {
        Command::new(command)
            .arg("--version")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default()
    } else {
        String::new()
    };

    CodexEnvironment {
        cli_found,
        cli_path,
        cli_version,
        config_files: codex_config_files(),
        skills: discover_skills(),
        mcp_servers: discover_mcp_servers(),
    }
}

fn codex_config_files() -> Vec<ConfigFileSummary> {
    let mut result = Vec::new();
    if let Some(home) = dirs::home_dir() {
        for path in [
            home.join(".codex").join("config.toml"),
            home.join(".codex").join("config.json"),
            home.join(".codex").join("settings.json"),
        ] {
            result.push(read_config_summary(path));
        }
    }
    result
}

fn read_config_summary(path: PathBuf) -> ConfigFileSummary {
    let exists = path.exists();
    let redacted_preview = if exists {
        fs::read_to_string(&path)
            .map(|content| {
                redact_config(&content)
                    .lines()
                    .take(16)
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_else(|_| "The file exists but could not be read.".to_string())
    } else {
        String::new()
    };
    ConfigFileSummary {
        path: path.to_string_lossy().to_string(),
        exists,
        redacted_preview,
    }
}

fn redact_config(content: &str) -> String {
    content
        .lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if lower.contains("key")
                || lower.contains("token")
                || lower.contains("secret")
                || lower.contains("password")
            {
                let left = line.split(['=', ':']).next().unwrap_or("secret");
                format!("{} = [redacted]", left.trim())
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn discover_skills() -> Vec<InventoryItem> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".codex").join("skills"));
    }
    let mut items = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root)
            .min_depth(1)
            .max_depth(2)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_type().is_file() && entry.file_name() == "SKILL.md" {
                if let Some(parent) = entry.path().parent() {
                    items.push(InventoryItem {
                        name: parent
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unnamed skill")
                            .to_string(),
                        location: parent.to_string_lossy().to_string(),
                        available: true,
                    });
                }
            }
        }
    }
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

fn discover_mcp_servers() -> Vec<McpServerSummary> {
    let mut result = Vec::new();
    if let Some(home) = dirs::home_dir() {
        for path in [
            home.join(".codex").join("mcp.json"),
            home.join(".codex").join("config.toml"),
            home.join(".config").join("codex").join("mcp.json"),
        ] {
            if path.exists() {
                result.extend(parse_mcp_file(&path));
            }
        }
    }
    dedupe_mcp(result)
}

fn parse_mcp_file(path: &Path) -> Vec<McpServerSummary> {
    let Ok(content) = fs::read_to_string(path) else {
        return vec![];
    };
    if path.extension().and_then(|s| s.to_str()) == Some("json") {
        if let Ok(value) = serde_json::from_str::<Value>(&content) {
            return parse_mcp_json(path, &value);
        }
    }
    parse_mcp_text(path, &content)
}

fn parse_mcp_json(path: &Path, value: &Value) -> Vec<McpServerSummary> {
    let mut result = Vec::new();
    if let Some(servers) = value
        .get("mcpServers")
        .or_else(|| value.get("mcp_servers"))
        .and_then(Value::as_object)
    {
        for (name, server) in servers {
            let command = server
                .get("command")
                .and_then(Value::as_str)
                .or_else(|| server.get("url").and_then(Value::as_str))
                .unwrap_or("configured");
            result.push(McpServerSummary {
                name: name.clone(),
                command_type: command.to_string(),
                configured: true,
                source: path.to_string_lossy().to_string(),
            });
        }
    }
    result
}

fn parse_mcp_text(path: &Path, content: &str) -> Vec<McpServerSummary> {
    let mut result = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[mcp_servers.") || trimmed.starts_with("[mcpServers.") {
            let name = trimmed
                .trim_start_matches("[mcp_servers.")
                .trim_start_matches("[mcpServers.")
                .trim_end_matches(']')
                .trim_matches('"')
                .to_string();
            result.push(McpServerSummary {
                name,
                command_type: "toml section".to_string(),
                configured: true,
                source: path.to_string_lossy().to_string(),
            });
        }
    }
    result
}

fn dedupe_mcp(items: Vec<McpServerSummary>) -> Vec<McpServerSummary> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for item in items {
        let key = format!("{}:{}", item.name, item.source);
        if seen.insert(key) {
            result.push(item);
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

fn launch_codex(command: &str, cwd: &str, args: &[&str]) -> Result<(), String> {
    let cwd_path = Path::new(cwd);
    if !cwd_path.exists() {
        return Err("The selected project directory no longer exists.".to_string());
    }

    let mut process = Command::new(if command.trim().is_empty() {
        "codex"
    } else {
        command.trim()
    });
    process.current_dir(cwd_path).args(args);
    process.spawn().map(|_| ()).map_err(|_| {
        "Codex CLI was not found or could not be started. Check the Codex command in Settings."
            .to_string()
    })
}
