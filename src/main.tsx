import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Code2,
  FolderGit2,
  GitBranch,
  GitCommit,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SquareArrowOutUpRight,
  Unlink,
  Wrench
} from "lucide-react";
import "./styles.css";

type Section = "dashboard" | "projects" | "sessions" | "codex" | "settings";
type TaskStatus = "Planned" | "Active" | "Completed" | "Blocked";

type Project = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

type EngineeringTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completionSummary: string;
};

type TaskSessionLink = {
  taskId: string;
  sessionId: string;
};

type AppSettings = {
  codexCommand: string;
  sessionsRoot: string;
};

type AppState = {
  projects: Project[];
  tasks: EngineeringTask[];
  links: TaskSessionLink[];
  settings: AppSettings;
};

type CodexSession = {
  id: string;
  filePath: string;
  projectPath: string;
  createdAt: string;
  lastActivity: string;
  title: string;
  model: string;
  lineCount: number;
};

type GitFileChange = {
  path: string;
  status: string;
  staged: boolean;
};

type GitStatus = {
  projectId: string;
  path: string;
  exists: boolean;
  isGitRepo: boolean;
  branch: string;
  changed: GitFileChange[];
  error: string;
};

type ConfigFileSummary = {
  path: string;
  exists: boolean;
  redactedPreview: string;
};

type InventoryItem = {
  name: string;
  location: string;
  available: boolean;
};

type McpServerSummary = {
  name: string;
  commandType: string;
  configured: boolean;
  source: string;
};

type CodexEnvironment = {
  cliFound: boolean;
  cliPath: string;
  cliVersion: string;
  configFiles: ConfigFileSummary[];
  skills: InventoryItem[];
  mcpServers: McpServerSummary[];
};

type InitialData = {
  state: AppState;
  sessions: CodexSession[];
  environment: CodexEnvironment;
  git: GitStatus[];
};

const emptyState: AppState = {
  projects: [],
  tasks: [],
  links: [],
  settings: {
    codexCommand: "codex",
    sessionsRoot: ""
  }
};

const emptyEnvironment: CodexEnvironment = {
  cliFound: false,
  cliPath: "",
  cliVersion: "",
  configFiles: [],
  skills: [],
  mcpServers: []
};

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(command, args);
}

function App() {
  const [section, setSection] = useState<Section>(initialSection());
  const [state, setState] = useState<AppState>(emptyState);
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [environment, setEnvironment] = useState<CodexEnvironment>(emptyEnvironment);
  const [git, setGit] = useState<GitStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("Loading local Codex workspace data...");
  const [nativeAvailable, setNativeAvailable] = useState(true);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setNotice("Refreshing projects, sessions, Git status, and Codex environment...");
      const data = await invokeNative<InitialData>("get_initial_data");
      setState(mergeStateDefaults(data.state));
      setSessions(data.sessions);
      setEnvironment(data.environment);
      setGit(data.git);
      setNativeAvailable(true);
      setNotice(`Loaded ${data.sessions.length} Codex sessions.`);
      if (!selectedProjectId && data.state.projects[0]) {
        setSelectedProjectId(data.state.projects[0].id);
      }
    } catch (error) {
      setNativeAvailable(false);
      if (isScreenshotPreview()) {
        const fixture = screenshotFixture();
        setState(fixture.state);
        setSessions(fixture.sessions);
        setEnvironment(fixture.environment);
        setGit(fixture.git);
        setSelectedProjectId(fixture.state.projects[0]?.id ?? "");
        setSelectedTaskId(fixture.state.tasks[0]?.id ?? "");
        setSelectedSessionId(fixture.sessions[0]?.id ?? "");
        setNotice("Screenshot preview data is active. Launch the Tauri app for live filesystem, Git, and Codex actions.");
        return;
      }
      const local = loadBrowserState();
      setState(local);
      setNotice("Desktop integration is offline in this browser preview. Launch the Tauri app for filesystem, Git, and Codex actions.");
    }
  }

  async function persist(next: AppState) {
    const normalized = mergeStateDefaults(next);
    setState(normalized);
    if (!nativeAvailable) {
      localStorage.setItem("codex-command-center-state", JSON.stringify(normalized));
      setNotice("Saved to browser local storage. Launch with Tauri for filesystem and Git integration.");
      return;
    }
    await invokeNative<void>("save_app_state", { state: normalized });
    setNotice("Saved local workspace state.");
  }

  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) ?? state.projects[0];
  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const projectGit = selectedProject ? git.find((item) => item.projectId === selectedProject.id) : undefined;
  const projectTasks = selectedProject ? state.tasks.filter((task) => task.projectId === selectedProject.id) : [];
  const linkedSessionIds = new Set(state.links.map((link) => link.sessionId));

  const filteredSessions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesQuery = !term || [session.id, session.title, session.projectPath, session.model]
        .join(" ")
        .toLowerCase()
        .includes(term);
      const matchesProject = !selectedProject || normalizePath(session.projectPath).startsWith(normalizePath(selectedProject.path));
      return section === "sessions" ? matchesQuery : matchesQuery && matchesProject;
    });
  }, [query, sessions, selectedProject, section]);

  function addProject(path: string) {
    const cleanPath = path.trim();
    if (!cleanPath) return;
    const project: Project = {
      id: crypto.randomUUID(),
      name: projectNameFromPath(cleanPath),
      path: cleanPath,
      createdAt: new Date().toISOString()
    };
    setSelectedProjectId(project.id);
    void persist({ ...state, projects: [...state.projects, project] });
  }

  function upsertTask(input: Partial<EngineeringTask>) {
    if (!selectedProject) return;
    const now = new Date().toISOString();
    if (input.id) {
      const tasks = state.tasks.map((task) => task.id === input.id ? { ...task, ...input, updatedAt: now } : task);
      void persist({ ...state, tasks });
      return;
    }
    const task: EngineeringTask = {
      id: crypto.randomUUID(),
      projectId: selectedProject.id,
      title: input.title?.trim() || "Untitled engineering task",
      description: input.description?.trim() || "",
      status: input.status ?? "Planned",
      createdAt: now,
      updatedAt: now,
      completionSummary: ""
    };
    setSelectedTaskId(task.id);
    void persist({ ...state, tasks: [...state.tasks, task] });
  }

  function linkSession(taskId: string, sessionId: string) {
    if (!taskId || !sessionId) return;
    if (state.links.some((link) => link.taskId === taskId && link.sessionId === sessionId)) return;
    void persist({ ...state, links: [...state.links, { taskId, sessionId }] });
  }

  function unlinkSession(taskId: string, sessionId: string) {
    void persist({ ...state, links: state.links.filter((link) => !(link.taskId === taskId && link.sessionId === sessionId)) });
  }

  async function launchResume(session: CodexSession) {
    const cwd = session.projectPath || selectedProject?.path || "";
    if (!cwd) {
      setNotice("The selected session does not expose a working directory.");
      return;
    }
    try {
      await invokeNative<void>("launch_codex_resume", {
        codexCommand: state.settings.codexCommand,
        cwd,
        sessionId: session.id
      });
      setNotice(`Launched Codex resume for ${shortId(session.id)}.`);
    } catch (error) {
      setNotice(String(error));
    }
  }

  async function launchTask(task: EngineeringTask) {
    const project = state.projects.find((item) => item.id === task.projectId);
    if (!project) return;
    const prompt = [task.title, task.description].filter(Boolean).join("\n\n");
    try {
      await invokeNative<void>("launch_codex_new", {
        codexCommand: state.settings.codexCommand,
        cwd: project.path,
        prompt
      });
      setNotice(`Launched Codex for "${task.title}".`);
    } catch (error) {
      setNotice(String(error));
    }
  }

  async function refreshProjectGit(project: Project) {
    try {
      const next = await invokeNative<GitStatus>("get_git_status", { project });
      setGit((items) => [...items.filter((item) => item.projectId !== project.id), next]);
      setNotice(`Refreshed Git status for ${project.name}.`);
    } catch (error) {
      setNotice(String(error));
    }
  }

  async function updateSettings(next: AppSettings) {
    await persist({ ...state, settings: next });
    if (nativeAvailable) {
      const env = await invokeNative<CodexEnvironment>("inspect_environment", {
        codexCommand: next.codexCommand,
        sessionsRoot: next.sessionsRoot
      });
      setEnvironment(env);
      const indexed = await invokeNative<CodexSession[]>("index_sessions", { sessionsRoot: next.sessionsRoot });
      setSessions(indexed);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Code2 size={22} /></div>
          <div>
            <h1>Codex Command Center</h1>
            <p>Organized Codex engineering work</p>
          </div>
        </div>
        <nav>
          <NavButton icon={<Activity />} label="Dashboard" active={section === "dashboard"} onClick={() => setSection("dashboard")} />
          <NavButton icon={<FolderGit2 />} label="Projects" active={section === "projects"} onClick={() => setSection("projects")} />
          <NavButton icon={<Bot />} label="Sessions" active={section === "sessions"} onClick={() => setSection("sessions")} />
          <NavButton icon={<Wrench />} label="Codex" active={section === "codex"} onClick={() => setSection("codex")} />
          <NavButton icon={<Settings />} label="Settings" active={section === "settings"} onClick={() => setSection("settings")} />
        </nav>
        <div className="sidebar-footer">
          <StatusPill tone={environment.cliFound ? "good" : "bad"}>{environment.cliFound ? "Codex CLI ready" : "Codex CLI missing"}</StatusPill>
          <button className="ghost-button" onClick={refresh}><RefreshCw size={15} />Refresh</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{"Project -> Task -> Codex Session -> File Changes -> Result"}</p>
            <h2>{sectionTitle(section)}</h2>
          </div>
          <div className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, projects, tasks" />
          </div>
        </header>

        <div className="notice">{notice}</div>

        {section === "dashboard" && (
          <Dashboard
            state={state}
            sessions={sessions}
            environment={environment}
            git={git}
            onOpenProject={(id) => { setSelectedProjectId(id); setSection("projects"); }}
            onOpenSession={(id) => { setSelectedSessionId(id); setSection("sessions"); }}
          />
        )}

        {section === "projects" && (
          <ProjectsView
            state={state}
            sessions={sessions}
            git={git}
            selectedProject={selectedProject}
            selectedTask={selectedTask}
            projectTasks={projectTasks}
            filteredSessions={filteredSessions}
            links={state.links}
            onAddProject={addProject}
            onSelectProject={setSelectedProjectId}
            onSelectTask={setSelectedTaskId}
            onSaveTask={upsertTask}
            onLinkSession={linkSession}
            onUnlinkSession={unlinkSession}
            onRefreshGit={refreshProjectGit}
            onLaunchTask={launchTask}
            onResumeSession={launchResume}
          />
        )}

        {section === "sessions" && (
          <SessionsView
            sessions={filteredSessions}
            projects={state.projects}
            tasks={state.tasks}
            links={state.links}
            selectedSessionId={selectedSessionId}
            selectedTaskId={selectedTaskId}
            linkedSessionIds={linkedSessionIds}
            onSelectSession={setSelectedSessionId}
            onSelectTask={setSelectedTaskId}
            onLinkSession={linkSession}
            onResumeSession={launchResume}
            selectedSession={selectedSession}
          />
        )}

        {section === "codex" && <CodexView environment={environment} sessionsRoot={state.settings.sessionsRoot} onRefresh={refresh} />}

        {section === "settings" && <SettingsView settings={state.settings} onSave={updateSettings} nativeAvailable={nativeAvailable} />}
      </main>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function Dashboard({ state, sessions, environment, git, onOpenProject, onOpenSession }: {
  state: AppState;
  sessions: CodexSession[];
  environment: CodexEnvironment;
  git: GitStatus[];
  onOpenProject: (id: string) => void;
  onOpenSession: (id: string) => void;
}) {
  const activeTasks = state.tasks.filter((task) => task.status === "Active");
  const changedRepos = git.filter((item) => item.changed.length > 0);
  const recentSessions = sessions.slice(0, 6);
  const visibleTasks = state.tasks.slice(0, 8);
  return (
    <div className="screen">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Codex Command Center</p>
          <h2>Turn Codex sessions into organized engineering work.</h2>
          <p>Codex executes the work. This app keeps the local projects, tasks, sessions, and file changes understandable.</p>
        </div>
        <StatusPill tone={environment.cliFound ? "good" : "bad"}>
          {environment.cliFound ? "Codex CLI ready" : "Codex CLI missing"}
        </StatusPill>
      </section>
      <section className="metrics-grid">
        <Metric icon={<ShieldCheck />} label="Codex CLI" value={environment.cliFound ? "Ready" : "Missing"} tone={environment.cliFound ? "good" : "bad"} />
        <Metric icon={<FolderGit2 />} label="Projects" value={state.projects.length.toString()} />
        <Metric icon={<ClipboardList />} label="Active Tasks" value={activeTasks.length.toString()} />
        <Metric icon={<Bot />} label="Recent Sessions" value={sessions.length.toString()} />
      </section>
      <section className="content-grid two">
        <Panel title="Active Work">
          {visibleTasks.length === 0 ? (
            <EmptyState title="No tasks yet" body="Create an engineering task to group related Codex sessions." />
          ) : (
          <DataTable headers={["Project", "Task", "Status", "Last Activity"]}>
            {visibleTasks.map((task) => {
              const project = state.projects.find((item) => item.id === task.projectId);
              return (
                <tr key={task.id}>
                  <td>{project?.name ?? "Unknown project"}</td>
                  <td>{task.title}</td>
                  <td><TaskStatusBadge status={task.status} /></td>
                  <td>{formatDate(taskLastActivity(task, state.links, sessions))}</td>
                </tr>
              );
            })}
          </DataTable>
          )}
        </Panel>
        <Panel title="Repository Status">
          {state.projects.length === 0 ? (
            <EmptyState title="No projects yet" body="Add a local development folder to start organizing Codex work." />
          ) : (
          <DataTable headers={["Project", "Branch", "Working Tree"]}>
            {state.projects.slice(0, 8).map((project) => {
              const status = git.find((item) => item.projectId === project.id);
              return (
                <tr key={project.id} onClick={() => onOpenProject(project.id)}>
                  <td>{project.name}</td>
                  <td>{status?.branch || "Not detected"}</td>
                  <td>{gitSummary(status)}</td>
                </tr>
              );
            })}
          </DataTable>
          )}
        </Panel>
      </section>
      <section className="content-grid">
        <Panel title="Recent Codex Activity">
          {recentSessions.length === 0 ? (
            <EmptyState title="No Codex sessions found" body="Sessions will appear here when local Codex history is discovered." />
          ) : (
          <DataTable headers={["Project", "Session", "Task", "Last Activity"]}>
            {recentSessions.map((session) => (
              <tr key={session.id} onClick={() => onOpenSession(session.id)}>
                <td>{projectNameFromPath(session.projectPath) || "Unassigned"}</td>
                <td>{shortId(session.id)}</td>
                <td>{sessionTaskTitle(session.id, state.links, state.tasks) || "Unlinked"}</td>
                <td>{formatDate(session.lastActivity)}</td>
              </tr>
            ))}
          </DataTable>
          )}
        </Panel>
      </section>
      {changedRepos.length > 0 && <p className="subtle">{changedRepos.length} registered repositories currently contain uncommitted changes.</p>}
    </div>
  );
}

function ProjectsView(props: {
  state: AppState;
  sessions: CodexSession[];
  git: GitStatus[];
  selectedProject?: Project;
  selectedTask?: EngineeringTask;
  projectTasks: EngineeringTask[];
  filteredSessions: CodexSession[];
  links: TaskSessionLink[];
  onAddProject: (path: string) => void;
  onSelectProject: (id: string) => void;
  onSelectTask: (id: string) => void;
  onSaveTask: (task: Partial<EngineeringTask>) => void;
  onLinkSession: (taskId: string, sessionId: string) => void;
  onUnlinkSession: (taskId: string, sessionId: string) => void;
  onRefreshGit: (project: Project) => void;
  onLaunchTask: (task: EngineeringTask) => void;
  onResumeSession: (session: CodexSession) => void;
}) {
  const [newPath, setNewPath] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const status = props.selectedProject ? props.git.find((item) => item.projectId === props.selectedProject?.id) : undefined;
  const taskLinks = props.selectedTask ? props.links.filter((link) => link.taskId === props.selectedTask?.id) : [];
  const linkedSessions = taskLinks.map((link) => props.sessions.find((session) => session.id === link.sessionId)).filter(Boolean) as CodexSession[];

  return (
    <div className="workspace-grid">
      <section className="panel project-list">
        <h3>Projects</h3>
        <div className="inline-form">
          <input value={newPath} onChange={(event) => setNewPath(event.target.value)} placeholder="Paste a local project path" />
          <button onClick={() => { props.onAddProject(newPath); setNewPath(""); }}><Plus size={15} />Add</button>
        </div>
        <div className="stack">
          {props.state.projects.map((project) => (
            <button key={project.id} className={props.selectedProject?.id === project.id ? "list-card project-card selected" : "list-card project-card"} onClick={() => props.onSelectProject(project.id)}>
              <strong>{project.name}</strong>
              <span>{project.path}</span>
              <div className="card-meta">
                <StatusPill>{props.git.find((item) => item.projectId === project.id)?.branch || "Branch unknown"}</StatusPill>
                <StatusPill tone={props.git.find((item) => item.projectId === project.id)?.changed.length ? "warn" : "good"}>{gitSummary(props.git.find((item) => item.projectId === project.id))}</StatusPill>
              </div>
              <span>{props.state.tasks.filter((task) => task.projectId === project.id).length} tasks · {formatDate(projectRecentSession(project, props.sessions)?.lastActivity ?? "")}</span>
            </button>
          ))}
          {props.state.projects.length === 0 && <EmptyState title="No projects yet" body="Add a local development folder to start organizing Codex work." />}
        </div>
      </section>
      <section className="workspace-main">
        {!props.selectedProject ? (
          <EmptyState title="No project selected" body="Add a local development folder to start organizing Codex work." />
        ) : (
          <>
            <Panel title={`Project: ${props.selectedProject.name}`} actions={<button onClick={() => props.onRefreshGit(props.selectedProject!)}><RefreshCw size={15} />Refresh Git</button>}>
              <div className="project-header">
                <div>
                  <p className="path">{props.selectedProject.path}</p>
                  <div className="badge-row">
                    <StatusPill><GitBranch size={13} />{status?.branch || "Branch unknown"}</StatusPill>
                    <StatusPill tone={status?.changed.length ? "warn" : "good"}>{gitSummary(status)}</StatusPill>
                    <StatusPill>{props.projectTasks.length} tasks</StatusPill>
                    <StatusPill>{countProjectSessions(props.selectedProject, props.sessions)} sessions</StatusPill>
                  </div>
                </div>
              </div>
              <div className="workspace-tabs" aria-label="Project workspace sections">
                <span>Overview</span>
                <span>Tasks</span>
                <span>Sessions</span>
                <span>Git</span>
              </div>
            </Panel>
            <div className="content-grid two">
              <Panel title="Tasks" actions={<button onClick={() => { props.onSaveTask({ title: draftTitle, description: draftDescription, status: "Planned" }); setDraftTitle(""); setDraftDescription(""); }}><Plus size={15} />Create Task</button>}>
                <div className="task-create">
                  <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Engineering objective" />
                  <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="Optional task context for Codex" />
                </div>
                <div className="stack">
                  {props.projectTasks.map((task) => (
                    <button key={task.id} className={props.selectedTask?.id === task.id ? "list-card selected" : "list-card"} onClick={() => props.onSelectTask(task.id)}>
                      <strong>{task.title}</strong>
                      <span><TaskStatusBadge status={task.status} /> {props.links.filter((link) => link.taskId === task.id).length} sessions · Updated {formatDate(task.updatedAt)}</span>
                    </button>
                  ))}
                  {props.projectTasks.length === 0 && <EmptyState title="No tasks yet" body="Create an engineering task to group related Codex sessions." />}
                </div>
              </Panel>
              <Panel title="Task Detail">
                {props.selectedTask ? (
                  <div className="detail-stack">
                    <input value={props.selectedTask.title} onChange={(event) => props.onSaveTask({ ...props.selectedTask, title: event.target.value })} />
                    <select value={props.selectedTask.status} onChange={(event) => props.onSaveTask({ ...props.selectedTask, status: event.target.value as TaskStatus })}>
                      <option>Planned</option>
                      <option>Active</option>
                      <option>Completed</option>
                      <option>Blocked</option>
                    </select>
                    <textarea value={props.selectedTask.description} onChange={(event) => props.onSaveTask({ ...props.selectedTask, description: event.target.value })} />
                    <div className="task-record">
                      <InfoLine label="Project" value={props.selectedProject.name} />
                      <InfoLine label="Created" value={formatDate(props.selectedTask.createdAt)} />
                      <InfoLine label="Updated" value={formatDate(props.selectedTask.updatedAt)} />
                      <InfoLine label="Git" value={`${status?.branch || "Branch unknown"} · ${gitSummary(status)}`} />
                    </div>
                    <button onClick={() => props.onLaunchTask(props.selectedTask!)}><Play size={15} />Launch Codex for Task</button>
                    <h4>Associated Sessions</h4>
                    {linkedSessions.map((session) => (
                      <div key={session.id} className="linked-row">
                        <span>{shortId(session.id)} · {session.title}</span>
                        <button className="icon-button" onClick={() => props.onResumeSession(session)} title="Resume Codex session"><SquareArrowOutUpRight size={14} /></button>
                        <button className="icon-button" onClick={() => props.onUnlinkSession(props.selectedTask!.id, session.id)} title="Unlink session"><Unlink size={14} /></button>
                      </div>
                    ))}
                    {linkedSessions.length === 0 && <EmptyState title="No linked sessions" body="Link an existing Codex session or launch Codex for this task." />}
                    <h4>Project Sessions</h4>
                    {props.filteredSessions.slice(0, 8).map((session) => (
                      <button key={session.id} className="list-card compact" onClick={() => props.onLinkSession(props.selectedTask!.id, session.id)}>
                        <strong><Link2 size={13} /> {shortId(session.id)}</strong>
                        <span>{session.title}</span>
                      </button>
                    ))}
                    {props.filteredSessions.length === 0 && <EmptyState title="No project sessions found" body="Codex sessions for this project will appear here after indexing." />}
                  </div>
                ) : (
                  <EmptyState title="Select a task" body="Tasks are the organizing layer above Codex sessions." />
                )}
              </Panel>
            </div>
            <div data-screenshot-anchor="git">
              <GitPanel status={status} project={props.selectedProject} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SessionsView(props: {
  sessions: CodexSession[];
  projects: Project[];
  tasks: EngineeringTask[];
  links: TaskSessionLink[];
  selectedSessionId: string;
  selectedTaskId: string;
  linkedSessionIds: Set<string>;
  selectedSession?: CodexSession;
  onSelectSession: (id: string) => void;
  onSelectTask: (id: string) => void;
  onLinkSession: (taskId: string, sessionId: string) => void;
  onResumeSession: (session: CodexSession) => void;
}) {
  const [projectFilter, setProjectFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const taskSessionIds = new Set(props.links.filter((link) => !taskFilter || link.taskId === taskFilter).map((link) => link.sessionId));
  const visibleSessions = props.sessions.filter((session) => {
    const project = props.projects.find((item) => item.id === projectFilter);
    const matchesProject = !project || normalizePath(session.projectPath).startsWith(normalizePath(project.path));
    const matchesTask = !taskFilter || taskSessionIds.has(session.id);
    return matchesProject && matchesTask;
  });

  return (
    <div className="content-grid sessions-layout">
      <Panel title="Indexed Codex Sessions">
        <div className="filter-row">
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="">All projects</option>
            {props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
            <option value="">All tasks</option>
            {props.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </div>
        <div className="stack">
          {visibleSessions.map((session) => (
            <button key={session.id} className={props.selectedSessionId === session.id ? "list-card selected" : "list-card"} onClick={() => props.onSelectSession(session.id)}>
              <strong>{session.title}</strong>
              <span>{shortId(session.id)} · {projectNameFromPath(session.projectPath) || "Unknown project"} · {sessionTaskTitle(session.id, props.links, props.tasks) || "Unlinked"} · {formatDate(session.lastActivity)}</span>
            </button>
          ))}
          {visibleSessions.length === 0 && <EmptyState title="No Codex sessions found" body="Sessions will appear here when local Codex history is discovered." />}
        </div>
      </Panel>
      <Panel title="Session Inspector">
        {props.selectedSession ? (
          <div className="detail-stack">
            <h3>{props.selectedSession.title}</h3>
            <InfoLine label="Session ID" value={props.selectedSession.id} />
            <InfoLine label="Project path" value={props.selectedSession.projectPath || "Not recorded"} />
            <InfoLine label="Session file" value={props.selectedSession.filePath} />
            <InfoLine label="Last activity" value={formatDate(props.selectedSession.lastActivity)} />
            <InfoLine label="Model" value={props.selectedSession.model || "Not recorded"} />
            <button onClick={() => props.onResumeSession(props.selectedSession!)}><Play size={15} />Resume Codex Session</button>
            <h4>Associate with Task</h4>
            <select value={props.selectedTaskId} onChange={(event) => props.onSelectTask(event.target.value)}>
              <option value="">Choose a task</option>
              {props.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            <button disabled={!props.selectedTaskId} onClick={() => props.onLinkSession(props.selectedTaskId, props.selectedSession!.id)}><Link2 size={15} />Link Session</button>
          </div>
        ) : (
          <EmptyState title="Select a session" body="Inspect metadata, link it to a task, or resume it with Codex." />
        )}
      </Panel>
    </div>
  );
}

function CodexView({ environment, sessionsRoot, onRefresh }: { environment: CodexEnvironment; sessionsRoot: string; onRefresh: () => void }) {
  return (
    <div className="screen">
      <section className="content-grid two">
        <Panel title="Codex CLI" actions={<button onClick={onRefresh}><RefreshCw size={15} />Refresh</button>}>
          <div className="detail-stack">
            <StatusPill tone={environment.cliFound ? "good" : "bad"}>{environment.cliFound ? "Detected" : "Codex CLI was not found."}</StatusPill>
            <InfoLine label="Executable" value={environment.cliPath || "Not detected"} />
            <InfoLine label="Version" value={environment.cliVersion || "Not available"} />
            <InfoLine label="Sessions root" value={sessionsRoot || "Default ~/.codex/sessions"} />
          </div>
        </Panel>
        <Panel title="Codex Configuration">
          <div className="stack">
            {environment.configFiles.map((file) => (
              <div key={file.path} className="config-preview">
                <strong>{file.path}</strong>
                <span>{file.exists ? "Found" : "Not found"}</span>
                {file.redactedPreview && <pre>{file.redactedPreview}</pre>}
              </div>
            ))}
          </div>
        </Panel>
      </section>
      <section className="content-grid two">
        <Panel title="Skills">
          {environment.skills.length ? environment.skills.map((skill) => <InventoryRow key={skill.location} item={skill} />) : <EmptyState title="No skills discovered" body="Codex skills will appear here when available under the local Codex skills directory." />}
        </Panel>
        <Panel title="MCP Servers">
          {environment.mcpServers.length ? environment.mcpServers.map((server) => (
            <div className="inventory-row" key={`${server.source}-${server.name}`}>
              <CircleDot size={15} />
              <div>
                <strong>{server.name}</strong>
                <span>{server.commandType} · {server.source}</span>
              </div>
            </div>
          )) : <EmptyState title="No MCP configuration discovered" body="Configured Codex MCP servers will appear here when local configuration files expose them." />}
        </Panel>
      </section>
    </div>
  );
}

function SettingsView({ settings, onSave, nativeAvailable }: { settings: AppSettings; onSave: (settings: AppSettings) => void; nativeAvailable: boolean }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <div className="screen narrow">
      <Panel title="Application Settings">
        <div className="settings-form">
          <label>
            Codex command
            <input value={draft.codexCommand} onChange={(event) => setDraft({ ...draft, codexCommand: event.target.value })} placeholder="codex" />
          </label>
          <label>
            Codex sessions root
            <input value={draft.sessionsRoot} onChange={(event) => setDraft({ ...draft, sessionsRoot: event.target.value })} placeholder="Default: ~/.codex/sessions" />
          </label>
          <button onClick={() => onSave(draft)}><Save size={15} />Save Settings</button>
        </div>
      </Panel>
      <Panel title="Privacy">
        <p className="body-copy">Codex Command Center stores project references, tasks, and session links locally. It indexes local Codex history and reads Git state from registered projects. It does not add telemetry, analytics, accounts, or cloud synchronization.</p>
      </Panel>
      {!nativeAvailable && <Panel title="Desktop Bridge"><p className="body-copy">The native bridge is unavailable because this page is running outside Tauri. Filesystem, Git, and Codex launch features require the desktop app.</p></Panel>}
    </div>
  );
}

function GitPanel({ status, project }: { status?: GitStatus; project: Project }) {
  const [selected, setSelected] = useState<GitFileChange | undefined>();
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const stagedCount = status?.changed.filter((change) => change.staged).length ?? 0;
  const unstagedCount = status?.changed.filter((change) => !change.staged).length ?? 0;

  async function loadDiff(change: GitFileChange) {
    setSelected(change);
    try {
      const result = await invokeNative<string>("get_git_diff", { path: project.path, filePath: change.path, staged: change.staged });
      setDiff(result || "No diff output for this file.");
    } catch (error) {
      setDiff(String(error));
    }
  }

  async function gitAction(command: "stage_file" | "unstage_file" | "commit_changes", file?: GitFileChange) {
    try {
      if (command === "commit_changes") {
        const result = await invokeNative<string>(command, { path: project.path, message });
        setNotice(result || "Commit completed.");
        setMessage("");
      } else if (file) {
        await invokeNative<void>(command, { path: project.path, filePath: file.path });
        setNotice(command === "stage_file" ? "File staged." : "File unstaged.");
      }
    } catch (error) {
      setNotice(String(error));
    }
  }

  return (
    <Panel title="Git Review">
      {!status?.isGitRepo ? (
        <EmptyState title="Git unavailable" body={status?.error || "This directory is not a Git repository."} />
      ) : (
        <>
        <div className="git-summary">
          <StatusPill><GitBranch size={13} />{status.branch || "Branch unknown"}</StatusPill>
          <StatusPill tone={status.changed.length ? "warn" : "good"}>{gitSummary(status)}</StatusPill>
          <StatusPill>{stagedCount} staged</StatusPill>
          <StatusPill>{unstagedCount} unstaged</StatusPill>
        </div>
        <div className="git-grid">
          <div className="stack">
            {status.changed.length === 0 && <EmptyState title="Working tree clean" body="There are no modified, staged, added, or deleted files." />}
            {status.changed.map((change) => (
              <button key={change.path} className={selected?.path === change.path ? "list-card compact selected" : "list-card compact"} onClick={() => loadDiff(change)}>
                <strong>{change.status} {change.path}</strong>
                <span>{change.staged ? "Staged" : "Unstaged"}</span>
              </button>
            ))}
          </div>
          <div className="diff-panel">
            <div className="diff-actions">
              {selected && (
                <>
                  <button onClick={() => gitAction("stage_file", selected)}>Stage</button>
                  <button onClick={() => gitAction("unstage_file", selected)}>Unstage</button>
                </>
              )}
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" />
              <button onClick={() => gitAction("commit_changes")}><GitCommit size={14} />Commit</button>
            </div>
            {notice && <p className="subtle">{notice}</p>}
            <pre>{diff || "Select a changed file to inspect its diff."}</pre>
          </div>
        </div>
        </>
      )}
    </Panel>
  );
}

function Panel({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <div className="panel-actions">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return <span className={`status-pill ${tone ?? ""}`}>{children}</span>;
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const tone = status === "Completed" ? "good" : status === "Blocked" ? "bad" : status === "Active" ? "warn" : undefined;
  return <StatusPill tone={tone}>{status}</StatusPill>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty"><CheckCircle2 size={18} /><strong>{title}</strong><span>{body}</span></div>;
}

function InventoryRow({ item }: { item: InventoryItem }) {
  return (
    <div className="inventory-row">
      <CircleDot size={15} />
      <div>
        <strong>{item.name}</strong>
        <span>{item.location}</span>
      </div>
    </div>
  );
}

function mergeStateDefaults(state: AppState): AppState {
  return {
    projects: state.projects ?? [],
    tasks: state.tasks ?? [],
    links: state.links ?? [],
    settings: { ...emptyState.settings, ...(state.settings ?? {}) }
  };
}

function loadBrowserState(): AppState {
  try {
    const raw = localStorage.getItem("codex-command-center-state");
    return raw ? mergeStateDefaults(JSON.parse(raw)) : emptyState;
  } catch {
    return emptyState;
  }
}

function gitSummary(status?: GitStatus) {
  if (!status) return "Git not checked";
  if (!status.exists) return "Directory missing";
  if (!status.isGitRepo) return "Not a Git repo";
  return status.changed.length === 0 ? "Working tree clean" : `${status.changed.length} changes`;
}

function countProjectSessions(project: Project, sessions: CodexSession[]) {
  const root = normalizePath(project.path);
  return sessions.filter((session) => normalizePath(session.projectPath).startsWith(root)).length;
}

function projectRecentSession(project: Project, sessions: CodexSession[]) {
  const root = normalizePath(project.path);
  return sessions.find((session) => normalizePath(session.projectPath).startsWith(root));
}

function taskLastActivity(task: EngineeringTask, links: TaskSessionLink[], sessions: CodexSession[]) {
  const linkedIds = new Set(links.filter((link) => link.taskId === task.id).map((link) => link.sessionId));
  const linkedSessions = sessions.filter((session) => linkedIds.has(session.id));
  return linkedSessions[0]?.lastActivity || task.updatedAt;
}

function sessionTaskTitle(sessionId: string, links: TaskSessionLink[], tasks: EngineeringTask[]) {
  const link = links.find((item) => item.sessionId === sessionId);
  return link ? tasks.find((task) => task.id === link.taskId)?.title ?? "" : "";
}

function sectionTitle(section: Section) {
  return {
    dashboard: "Dashboard",
    projects: "Projects",
    sessions: "Sessions",
    codex: "Codex Environment",
    settings: "Settings"
  }[section];
}

function projectNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  return normalized.split("/").pop() ?? path;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

function formatDate(value: string) {
  if (!value) return "Unknown";
  if (/^\d+$/.test(value)) {
    return new Date(Number(value) * 1000).toLocaleString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function initialSection(): Section {
  if (typeof window === "undefined") return "dashboard";
  const section = new URLSearchParams(window.location.search).get("section");
  return isSection(section) ? section : "dashboard";
}

function isSection(value: string | null): value is Section {
  return value === "dashboard" || value === "projects" || value === "sessions" || value === "codex" || value === "settings";
}

function isScreenshotPreview() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("screenshot") === "1";
}

function screenshotFixture(): InitialData {
  const state: AppState = {
    projects: [
      { id: "project-desktop", name: "desktop-client", path: "D:\\Projects\\desktop-client", createdAt: "2026-08-12T09:00:00.000Z" },
      { id: "project-api", name: "api-service", path: "D:\\Projects\\api-service", createdAt: "2026-08-14T10:30:00.000Z" },
      { id: "project-web", name: "sample-web-app", path: "D:\\Projects\\sample-web-app", createdAt: "2026-08-16T15:45:00.000Z" }
    ],
    tasks: [
      {
        id: "task-release",
        projectId: "project-desktop",
        title: "Prepare release candidate",
        description: "Tighten documentation, packaging, and local validation before publication.",
        status: "Active",
        createdAt: "2026-08-17T08:30:00.000Z",
        updatedAt: "2026-08-19T07:20:00.000Z",
        completionSummary: ""
      },
      {
        id: "task-git-review",
        projectId: "project-desktop",
        title: "Review Git changes before handoff",
        description: "Inspect staged and unstaged files, then prepare a focused commit.",
        status: "Planned",
        createdAt: "2026-08-18T11:15:00.000Z",
        updatedAt: "2026-08-18T11:15:00.000Z",
        completionSummary: ""
      },
      {
        id: "task-session-index",
        projectId: "project-api",
        title: "Link session history to active tasks",
        description: "Attach recent Codex sessions to the project tasks that produced them.",
        status: "Completed",
        createdAt: "2026-08-15T13:00:00.000Z",
        updatedAt: "2026-08-18T16:45:00.000Z",
        completionSummary: "Session metadata is organized by project."
      }
    ],
    links: [
      { taskId: "task-release", sessionId: "session-release-readiness" },
      { taskId: "task-git-review", sessionId: "session-git-review" },
      { taskId: "task-session-index", sessionId: "session-indexing" }
    ],
    settings: {
      codexCommand: "codex",
      sessionsRoot: "C:\\Users\\sample\\.codex\\sessions"
    }
  };

  return {
    state,
    sessions: [
      {
        id: "session-release-readiness",
        filePath: "C:\\Users\\sample\\.codex\\sessions\\session-release-readiness.jsonl",
        projectPath: "D:\\Projects\\desktop-client",
        createdAt: "2026-08-19T06:50:00.000Z",
        lastActivity: "2026-08-19T07:20:00.000Z",
        title: "Prepare the Windows release candidate",
        model: "gpt-5-codex",
        lineCount: 184
      },
      {
        id: "session-git-review",
        filePath: "C:\\Users\\sample\\.codex\\sessions\\session-git-review.jsonl",
        projectPath: "D:\\Projects\\desktop-client",
        createdAt: "2026-08-18T11:10:00.000Z",
        lastActivity: "2026-08-18T11:45:00.000Z",
        title: "Inspect staged and unstaged changes",
        model: "gpt-5-codex",
        lineCount: 96
      },
      {
        id: "session-indexing",
        filePath: "C:\\Users\\sample\\.codex\\sessions\\session-indexing.jsonl",
        projectPath: "D:\\Projects\\api-service",
        createdAt: "2026-08-17T14:00:00.000Z",
        lastActivity: "2026-08-18T16:45:00.000Z",
        title: "Index local Codex session metadata",
        model: "gpt-5-codex",
        lineCount: 142
      }
    ],
    environment: {
      cliFound: true,
      cliPath: "C:\\Program Files\\Codex\\codex.exe",
      cliVersion: "codex-cli 0.0.0",
      configFiles: [
        {
          path: "C:\\Users\\sample\\.codex\\config.toml",
          exists: true,
          redactedPreview: "model = \"gpt-5-codex\"\napi_key = [redacted]\n[mcp_servers.local-docs]\ncommand = \"npx\""
        },
        {
          path: "C:\\Users\\sample\\.codex\\mcp.json",
          exists: true,
          redactedPreview: "{\"mcpServers\":{\"local-docs\":{\"command\":\"npx\"}}}"
        }
      ],
      skills: [
        { name: "release-readiness", location: "C:\\Users\\sample\\.codex\\skills\\release-readiness", available: true },
        { name: "windows-packaging", location: "C:\\Users\\sample\\.codex\\skills\\windows-packaging", available: true }
      ],
      mcpServers: [
        { name: "local-docs", commandType: "npx", configured: true, source: "C:\\Users\\sample\\.codex\\mcp.json" },
        { name: "workspace-tools", commandType: "toml section", configured: true, source: "C:\\Users\\sample\\.codex\\config.toml" }
      ]
    },
    git: [
      {
        projectId: "project-desktop",
        path: "D:\\Projects\\desktop-client",
        exists: true,
        isGitRepo: true,
        branch: "release/v0.1.0",
        changed: [
          { path: "README.md", status: "M", staged: false },
          { path: ".github/workflows/release.yml", status: "A", staged: true },
          { path: "docs/releases/v0.1.0.md", status: "A", staged: false }
        ],
        error: ""
      },
      {
        projectId: "project-api",
        path: "D:\\Projects\\api-service",
        exists: true,
        isGitRepo: true,
        branch: "main",
        changed: [],
        error: ""
      },
      {
        projectId: "project-web",
        path: "D:\\Projects\\sample-web-app",
        exists: true,
        isGitRepo: true,
        branch: "feature/navigation",
        changed: [{ path: "src/navigation.ts", status: "M", staged: false }],
        error: ""
      }
    ]
  };
}

createRoot(document.getElementById("root")!).render(<App />);
