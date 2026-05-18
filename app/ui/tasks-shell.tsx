"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type Department = "fiscal" | "contabil" | "pessoal" | "societario_paralegal" | "administrativo";
type TaskStatus = "to_do" | "in_progress" | "blocked" | "done";
type TaskPriority = "low" | "normal" | "high" | "urgent";

type Client = { id: string; name: string };

type ViewType = "list" | "board" | "calendar";
type SavedView = { id: string; name: string; viewType: ViewType; department: Department | null; config: Record<string, unknown> };

type TaskListItem = {
  id: string;
  title: string;
  department: Department;
  status: TaskStatus;
  priority: TaskPriority;
  client: Client | null;
  assignee: { agentId: string; name: string } | null;
  dueAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type TaskDetails = TaskListItem & {
  description: string | null;
  createdBy: { agentId: string; name: string } | null;
};

type CommentItem = { id: string; authorName: string; body: string; createdAt: string };
type AttachmentItem = { id: string; filename: string; mimetype: string | null; sizeBytes: number; createdAt: string };
type ReactionSummary = { emoji: string; count: number; mine: boolean };
type AuditItem = { id: string; actorName: string; eventType: string; data: any; createdAt: string };
type ReportsData = {
  wipByStatus: Array<{ status: string; count: number }>;
  workloadByAssignee: Array<{ assigneeAgentId: string | null; assigneeName: string; count: number }>;
  tasksByClient: Array<{ clientId: string | null; clientName: string; count: number }>;
  sla: { overdueOpenTasks: number; avgLeadTimeHoursDone: number | null };
};

function deptLabel(d: Department) {
  switch (d) {
    case "fiscal":
      return "Fiscal";
    case "contabil":
      return "Contábil";
    case "pessoal":
      return "Pessoal";
    case "societario_paralegal":
      return "Societário/Paralegal";
    case "administrativo":
      return "Administrativo";
  }
}

function statusLabel(s: TaskStatus) {
  switch (s) {
    case "to_do":
      return "A Fazer";
    case "in_progress":
      return "Em Andamento";
    case "blocked":
      return "Bloqueado";
    case "done":
      return "Concluído";
  }
}

function priorityLabel(p: TaskPriority) {
  switch (p) {
    case "low":
      return "Baixa";
    case "normal":
      return "Normal";
    case "high":
      return "Alta";
    case "urgent":
      return "Urgente";
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderWithMentions(text: string) {
  const parts: Array<{ t: string; mention?: boolean }> = [];
  const re = /@([a-z0-9_]+)/gi;
  let last = 0;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) parts.push({ t: text.slice(last, start) });
    const handle = (m[1] ?? "").toLowerCase();
    const isKnown = handle === "vanderlei" || handle === "gustavo";
    parts.push({ t: text.slice(start, end), mention: isKnown });
    last = end;
  }
  if (last < text.length) parts.push({ t: text.slice(last) });
  return (
    <span>
      {parts.map((p, idx) =>
        p.mention ? (
          <span
            key={idx}
            className="rounded-md bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--primary)_35%,transparent)] px-1"
          >
            {p.t}
          </span>
        ) : (
          <span key={idx}>{p.t}</span>
        ),
      )}
    </span>
  );
}

export default function TasksShell() {
  const router = useRouter();
  const [me, setMe] = useState<Agent | null>(null);

  const [q, setQ] = useState("");
  const [department, setDepartment] = useState<Department>("fiscal");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [assignee, setAssignee] = useState<"all" | "vanderlei" | "gustavo">("all");
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [reactionsByCommentId, setReactionsByCommentId] = useState<Record<string, ReactionSummary[]>>({});

  const [toast, setToast] = useState<string | null>(null);

  const [viewType, setViewType] = useState<ViewType>("list");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("builtin:minhas");
  const [creatingView, setCreatingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // create task
  const [creating, setCreating] = useState(false);
  const [newDepartment, setNewDepartment] = useState<Department>("fiscal");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newAssignee, setNewAssignee] = useState<"none" | "vanderlei" | "gustavo">("none");
  const [newDueAt, setNewDueAt] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const commentFileRef = useRef<HTMLInputElement | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function applyBuiltInView(id: string) {
    setSelectedSavedViewId(id);
    if (id === "builtin:minhas") {
      setAssignee(me?.agentId ?? "all");
      setStatus("all");
      setQ("");
    }
    if (id === "builtin:urgentes_hoje") {
      setAssignee(me?.agentId ?? "all");
      setStatus("all");
      setQ("");
      // nothing else; backend will filter in UI by due date when rendering calendar/list
    }
    if (id === "builtin:atrasadas") {
      setAssignee(me?.agentId ?? "all");
      setStatus("all");
      setQ("");
    }
  }

  async function loadMe() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Agent;
    setMe(data);
  }

  async function loadSavedViews() {
    const url = new URL("/api/task-views", window.location.origin);
    url.searchParams.set("department", department);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: SavedView[] };
    setSavedViews(data.items);
  }

  async function loadTasks() {
    const url = new URL("/api/tasks", window.location.origin);
    url.searchParams.set("department", department);
    if (q.trim()) url.searchParams.set("q", q.trim());
    if (status !== "all") url.searchParams.set("status", status);
    if (assignee !== "all") url.searchParams.set("assigneeAgentId", assignee);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      setToast(data?.details ? `${data.error ?? "Erro"}: ${data.details}` : data?.error ?? "Falha ao carregar tarefas");
      return;
    }
    const data = (await res.json()) as { items: TaskListItem[] };
    setTasks(data.items);
    if (!selectedTaskId && data.items[0]?.id) setSelectedTaskId(data.items[0].id);
  }

  async function loadTaskDetails(taskId: string) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { item: TaskDetails };
    setDetails(data.item);
  }

  async function loadTaskComments(taskId: string) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: Array<CommentItem & { mentions?: string[] }> };
    setComments(data.items);
  }

  async function loadTaskAttachments(taskId: string) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: AttachmentItem[] };
    setAttachments(data.items);
  }

  async function refreshTask(taskId: string) {
    await Promise.all([loadTaskDetails(taskId), loadTaskComments(taskId), loadTaskAttachments(taskId), loadTaskAudit(taskId)]);
    await loadTasks();
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Falha ao atualizar tarefa");
    }
  }

  async function createTask() {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      let clientId: string | undefined = undefined;
      if (newClientName.trim()) {
        const resClient = await fetch("/api/clients", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: newClientName.trim() }),
        });
        if (!resClient.ok) throw new Error("Falha ao criar cliente");
        const dataClient = (await resClient.json()) as { id: string };
        clientId = dataClient.id;
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: newDescription.trim() || undefined,
          department: newDepartment,
          priority: newPriority,
          assigneeAgentId: newAssignee === "none" ? null : newAssignee,
          clientId,
          dueAt: newDueAt ? new Date(newDueAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Falha ao criar tarefa");
      }
      const data = (await res.json()) as { id: string };
      setNewTitle("");
      setNewDescription("");
      setNewClientName("");
      setNewPriority("normal");
      setNewAssignee("none");
      setNewDueAt("");
      await loadTasks();
      setSelectedTaskId(data.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar tarefa");
    } finally {
      setCreating(false);
    }
  }

  async function addComment(taskId: string, body: string) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Falha ao comentar");
    }
  }

  async function loadTaskAudit(taskId: string) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/audit`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: AuditItem[] };
    setAudit(data.items);
  }

  async function loadReports() {
    const url = new URL("/api/reports/tasks", window.location.origin);
    url.searchParams.set("department", department);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as ReportsData;
    setReports(data);
  }

  async function loadReactions(commentId: string) {
    const res = await fetch(`/api/tasks/comments/${encodeURIComponent(commentId)}/reactions`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: ReactionSummary[] };
    setReactionsByCommentId((prev) => ({ ...prev, [commentId]: data.items }));
  }

  async function toggleReaction(commentId: string, emoji: string, mine: boolean) {
    const method = mine ? "DELETE" : "POST";
    const res = await fetch(`/api/tasks/comments/${encodeURIComponent(commentId)}/reactions`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return;
    await loadReactions(commentId);
  }

  async function uploadCommentAttachments(commentId: string, files: File[]) {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const res = await fetch(`/api/tasks/comments/${encodeURIComponent(commentId)}/attachments`, { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Falha ao enviar arquivo");
    }
  }

  async function uploadAttachments(taskId: string, files: File[]) {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Falha ao enviar arquivo");
    }
  }

  async function createSavedView() {
    const name = newViewName.trim();
    if (!name) return;
    setCreatingView(true);
    try {
      const config = {
        q: q.trim() || null,
        status,
        assignee,
      };
      const res = await fetch("/api/task-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, viewType, department, config }),
      });
      if (!res.ok) throw new Error("Falha ao criar view");
      const data = (await res.json()) as { id: string };
      setNewViewName("");
      await loadSavedViews();
      setSelectedSavedViewId(data.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar view");
    } finally {
      setCreatingView(false);
    }
  }

  useEffect(() => {
    void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTasks();
    setNewDepartment(department);
    void loadSavedViews();
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department]);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetails(null);
      setComments([]);
      setAttachments([]);
      return;
    }
    void refreshTask(selectedTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen">
        <aside className="w-[360px] shrink-0 border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_80%,black)]">
          <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/3"
            >
              <div className="h-10 w-10 rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mark.png" alt="Logo" className="h-7 w-7" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold leading-tight">Tarefas</div>
                <div className="text-xs text-[var(--muted)] leading-tight">{me ? me.agentName : "Carregando..."}</div>
              </div>
            </button>

            <button
              onClick={() => void logout()}
              className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
            >
              Sair
            </button>
          </div>

          <div className="p-4 space-y-3 border-b border-[var(--border)]">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setViewType("list")}
                className={[
                  "rounded-2xl px-3 py-2 text-sm ring-1",
                  viewType === "list"
                    ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                    : "bg-white/5 ring-white/10 hover:bg-white/8",
                ].join(" ")}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setViewType("board")}
                className={[
                  "rounded-2xl px-3 py-2 text-sm ring-1",
                  viewType === "board"
                    ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                    : "bg-white/5 ring-white/10 hover:bg-white/8",
                ].join(" ")}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setViewType("calendar")}
                className={[
                  "rounded-2xl px-3 py-2 text-sm ring-1 col-span-2",
                  viewType === "calendar"
                    ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                    : "bg-white/5 ring-white/10 hover:bg-white/8",
                ].join(" ")}
              >
                Calendário
              </button>
            </div>

            <div className="grid gap-2">
              <select
                value={selectedSavedViewId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id.startsWith("builtin:")) {
                    applyBuiltInView(id);
                    return;
                  }
                  setSelectedSavedViewId(id);
                  const v = savedViews.find((x) => x.id === id);
                  if (!v) return;
                  const cfg = v.config ?? {};
                  const cfgQ = typeof cfg.q === "string" ? cfg.q : "";
                  const cfgStatus = (cfg.status as TaskStatus | "all") ?? "all";
                  const cfgAssignee = (cfg.assignee as typeof assignee) ?? "all";
                  setQ(cfgQ);
                  setStatus(cfgStatus);
                  setAssignee(cfgAssignee);
                }}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="builtin:minhas">Minhas tarefas</option>
                <option value="builtin:urgentes_hoje">Urgentes hoje</option>
                <option value="builtin:atrasadas">Atrasadas</option>
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Salvar filtro como..."
                  className="flex-1 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => void createSavedView()}
                  disabled={creatingView || !newViewName.trim()}
                  className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-2 text-sm hover:bg-white/8 disabled:opacity-60"
                >
                  Salvar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="fiscal">Fiscal</option>
                <option value="contabil">Contábil</option>
                <option value="pessoal">Pessoal</option>
                <option value="societario_paralegal">Societário</option>
                <option value="administrativo">Administrativo</option>
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus | "all")}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="all">Status</option>
                <option value="to_do">A Fazer</option>
                <option value="in_progress">Em Andamento</option>
                <option value="blocked">Bloqueado</option>
                <option value="done">Concluído</option>
              </select>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value as typeof assignee)}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none col-span-2"
              >
                <option value="all">Responsável</option>
                <option value="vanderlei">Vanderlei</option>
                <option value="gustavo">Gustavo</option>
              </select>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar tarefas..."
              className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadTasks();
              }}
            />

            <button
              type="button"
              onClick={() => void loadTasks()}
              className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-2 text-sm hover:bg-white/8"
            >
              Atualizar lista
            </button>
          </div>

          <div className="overflow-y-auto h-[calc(100vh-64px-176px)]">
            {tasks.map((t) => {
              const active = t.id === selectedTaskId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTaskId(t.id)}
                  className={[
                    "w-full text-left px-4 py-3 border-b border-[var(--border)] transition",
                    active ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)]" : "hover:bg-white/3",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs text-[var(--muted)] truncate">
                        {deptLabel(t.department)} • {statusLabel(t.status)}
                        {t.client ? ` • ${t.client.name}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                      {priorityLabel(t.priority)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-[var(--border)] px-6 flex items-center justify-between bg-[var(--background)]/80 backdrop-blur">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{selectedTask ? selectedTask.title : "Selecione uma tarefa"}</div>
              <div className="text-xs text-[var(--muted)] truncate">
                {selectedTask ? `${deptLabel(selectedTask.department)} • ${statusLabel(selectedTask.status)}` : "—"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void createTask()}
              disabled={creating || newTitle.trim().length === 0}
              className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? "Criando..." : "Nova tarefa"}
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {viewType === "board" ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {(["to_do", "in_progress", "blocked", "done"] as TaskStatus[]).map((s) => (
                  <div key={s} className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-sm font-semibold">{statusLabel(s)}</div>
                    <div className="mt-3 space-y-2">
                      {tasks
                        .filter((t) => t.status === s)
                        .slice(0, 50)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedTaskId(t.id)}
                            className="w-full text-left rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                          >
                            <div className="text-sm font-medium truncate">{t.title}</div>
                            <div className="mt-1 text-xs text-[var(--muted)] truncate">
                              {t.client ? t.client.name : "Sem cliente"} • {priorityLabel(t.priority)}
                            </div>
                          </button>
                        ))}
                      {tasks.filter((t) => t.status === s).length === 0 ? (
                        <div className="text-xs text-[var(--muted)]">Sem tarefas.</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {viewType === "calendar" ? (
              <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                <div className="text-sm font-semibold">Calendário (por prazo)</div>
                <div className="mt-3 space-y-2">
                  {tasks
                    .filter((t) => t.dueAt)
                    .slice()
                    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTaskId(t.id)}
                        className="w-full text-left rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium truncate">{t.title}</div>
                          <div className="text-xs text-[var(--muted)] shrink-0">{formatTime(t.dueAt!)}</div>
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted)] truncate">
                          {statusLabel(t.status)} • {t.client ? t.client.name : "Sem cliente"} • {priorityLabel(t.priority)}
                        </div>
                      </button>
                    ))}
                  {tasks.filter((t) => t.dueAt).length === 0 ? (
                    <div className="text-xs text-[var(--muted)]">Nenhuma tarefa com prazo.</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {viewType === "list" ? (
              <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                <div className="text-sm font-semibold">Lista</div>
                <div className="mt-3 space-y-2">
                  {tasks.slice(0, 200).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTaskId(t.id)}
                      className="w-full text-left rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-[var(--muted)] shrink-0">{priorityLabel(t.priority)}</div>
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)] truncate">
                        {deptLabel(t.department)} • {statusLabel(t.status)}
                        {t.assignee ? ` • ${t.assignee.name}` : " • Sem responsável"}
                        {t.client ? ` • ${t.client.name}` : ""}
                        {t.dueAt ? ` • ${formatTime(t.dueAt)}` : ""}
                      </div>
                    </button>
                  ))}
                  {tasks.length === 0 ? <div className="text-xs text-[var(--muted)]">Sem tarefas.</div> : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
              <div className="text-sm font-semibold">Criar tarefa</div>
              <div className="mt-4 grid gap-3">
                <select
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value as Department)}
                  className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                >
                  <option value="fiscal">Fiscal</option>
                  <option value="contabil">Contábil</option>
                  <option value="pessoal">Pessoal</option>
                  <option value="societario_paralegal">Societário</option>
                  <option value="administrativo">Administrativo</option>
                </select>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título"
                  className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                />
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  placeholder="Descrição (opcional)"
                  className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none resize-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Cliente (nome)"
                    className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value as typeof newAssignee)}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="none">Sem responsável</option>
                    <option value="vanderlei">Vanderlei</option>
                    <option value="gustavo">Gustavo</option>
                  </select>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="low">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={newDueAt}
                    onChange={(e) => setNewDueAt(e.target.value)}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>
            </div>

            {details ? (
              <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate">{details.title}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      Criado em {formatTime(details.createdAt)}{details.createdBy ? ` • por ${details.createdBy.name}` : ""}
                    </div>
                  </div>
                </div>

                {details.description ? <div className="text-sm whitespace-pre-wrap">{details.description}</div> : null}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <select
                    value={details.status}
                    onChange={(e) => {
                      const v = e.target.value as TaskStatus;
                      void (async () => {
                        try {
                          await patchTask(details.id, { status: v });
                          await refreshTask(details.id);
                        } catch (err) {
                          setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                        }
                      })();
                    }}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="to_do">A Fazer</option>
                    <option value="in_progress">Em Andamento</option>
                    <option value="blocked">Bloqueado</option>
                    <option value="done">Concluído</option>
                  </select>

                  <select
                    value={details.assignee?.agentId ?? "none"}
                    onChange={(e) => {
                      const v = e.target.value;
                      void (async () => {
                        try {
                          await patchTask(details.id, { assigneeAgentId: v === "none" ? null : v });
                          await refreshTask(details.id);
                        } catch (err) {
                          setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                        }
                      })();
                    }}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="none">Sem responsável</option>
                    <option value="vanderlei">Vanderlei</option>
                    <option value="gustavo">Gustavo</option>
                  </select>

                  <select
                    value={details.priority}
                    onChange={(e) => {
                      const v = e.target.value as TaskPriority;
                      void (async () => {
                        try {
                          await patchTask(details.id, { priority: v });
                          await refreshTask(details.id);
                        } catch (err) {
                          setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                        }
                      })();
                    }}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="low">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>

                  <select
                    value={details.department}
                    onChange={(e) => {
                      const v = e.target.value as Department;
                      void (async () => {
                        try {
                          await patchTask(details.id, { department: v });
                          await refreshTask(details.id);
                        } catch (err) {
                          setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                        }
                      })();
                    }}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="fiscal">Fiscal</option>
                    <option value="contabil">Contábil</option>
                    <option value="pessoal">Pessoal</option>
                    <option value="societario_paralegal">Societário</option>
                    <option value="administrativo">Administrativo</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-sm font-semibold">Comentários</div>
                    <div className="mt-3 space-y-3">
                      {comments.map((c) => (
                        <div key={c.id} className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold">{c.authorName}</div>
                            <div className="text-[10px] text-[var(--muted)]">{formatTime(c.createdAt)}</div>
                          </div>
                          <div className="mt-1 text-sm whitespace-pre-wrap">{renderWithMentions(c.body)}</div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {(reactionsByCommentId[c.id] ?? []).map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={() => void toggleReaction(c.id, r.emoji, r.mine)}
                                className={[
                                  "text-xs rounded-full px-3 py-1 ring-1 transition",
                                  r.mine
                                    ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                                    : "bg-white/5 ring-white/10 hover:bg-white/8",
                                ].join(" ")}
                              >
                                {r.emoji} {r.count}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                void loadReactions(c.id);
                              }}
                              className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8"
                            >
                              Atualizar reações
                            </button>
                            {["👍", "✅", "🔥"].map((e) => (
                              <button
                                key={e}
                                type="button"
                                onClick={() => void toggleReaction(c.id, e, Boolean((reactionsByCommentId[c.id] ?? []).find((x) => x.emoji === e)?.mine))}
                                className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8"
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3">
                        <textarea
                          value={commentBody}
                          onChange={(e) => setCommentBody(e.target.value)}
                          rows={3}
                          placeholder="Escreva um comentário... (use @vanderlei / @gustavo)"
                          className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-[var(--muted)]"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <label className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 hover:bg-white/8 cursor-pointer">
                            Anexar
                            <input
                              ref={commentFileRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                setCommentFiles(files.slice(0, 5));
                              }}
                            />
                          </label>
                          <div className="text-xs text-[var(--muted)] truncate">
                            {commentFiles.length > 0 ? commentFiles.map((f) => f.name).join(", ") : "Até 5 arquivos"}
                          </div>
                          <button
                            type="button"
                            disabled={commentSending || commentBody.trim().length === 0}
                            onClick={() => {
                              void (async () => {
                                setCommentSending(true);
                                try {
                                  await addComment(details.id, commentBody.trim());
                                  setCommentBody("");
                                  await refreshTask(details.id);
                                  // upload after comment exists: fetch latest to get last id
                                  if (commentFiles.length > 0) {
                                    const latest = await fetch(`/api/tasks/${encodeURIComponent(details.id)}/comments`, { cache: "no-store" });
                                    const latestData = (await latest.json()) as { items: CommentItem[] };
                                    const last = latestData.items[latestData.items.length - 1];
                                    if (last?.id) await uploadCommentAttachments(last.id, commentFiles);
                                    setCommentFiles([]);
                                  }
                                  await refreshTask(details.id);
                                } catch (err) {
                                  setToast(err instanceof Error ? err.message : "Falha ao comentar");
                                } finally {
                                  setCommentSending(false);
                                }
                              })();
                            }}
                            className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                          >
                            {commentSending ? "Enviando..." : "Comentar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Arquivos</div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length === 0) return;
                          void (async () => {
                            try {
                              await uploadAttachments(details.id, files.slice(0, 5));
                              await refreshTask(details.id);
                            } catch (err) {
                              setToast(err instanceof Error ? err.message : "Falha ao enviar arquivo");
                            } finally {
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }
                          })();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                      >
                        Enviar
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {attachments.map((a) => (
                        <a
                          key={a.id}
                          href={`/api/tasks/attachments/download?id=${encodeURIComponent(a.id)}`}
                          className="block text-sm rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 hover:bg-white/8"
                        >
                          {a.filename}
                        </a>
                      ))}
                      {attachments.length === 0 ? <div className="text-xs text-[var(--muted)]">Sem anexos.</div> : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                  <div className="text-sm font-semibold">Histórico</div>
                  <div className="mt-3 space-y-2">
                    {audit.map((a) => (
                      <div key={a.id} className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold">{a.actorName}</div>
                          <div className="text-[10px] text-[var(--muted)]">{formatTime(a.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{a.eventType}</div>
                      </div>
                    ))}
                    {audit.length === 0 ? <div className="text-xs text-[var(--muted)]">Sem alterações registradas.</div> : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[var(--muted)]">Selecione uma tarefa na lista.</div>
            )}

            {reports ? (
              <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                <div className="text-sm font-semibold">Dashboard • {deptLabel(department)}</div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-xs text-[var(--muted)]">Atrasadas (SLA)</div>
                    <div className="mt-1 text-2xl font-semibold">{reports.sla.overdueOpenTasks}</div>
                  </div>
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-xs text-[var(--muted)]">Lead time médio (concluídas)</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {reports.sla.avgLeadTimeHoursDone === null ? "—" : `${Math.round(reports.sla.avgLeadTimeHoursDone)}h`}
                    </div>
                  </div>
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-xs text-[var(--muted)]">WIP por status</div>
                    <div className="mt-2 space-y-1">
                      {reports.wipByStatus.map((s) => (
                        <div key={s.status} className="flex items-center justify-between text-sm">
                          <div className="text-[var(--muted)]">{s.status}</div>
                          <div>{s.count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-sm font-semibold">Carga por responsável</div>
                    <div className="mt-3 space-y-2">
                      {reports.workloadByAssignee.slice(0, 8).map((x) => (
                        <div key={x.assigneeName} className="flex items-center justify-between text-sm">
                          <div className="text-[var(--muted)]">{x.assigneeName}</div>
                          <div>{x.count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-sm font-semibold">Tarefas por cliente</div>
                    <div className="mt-3 space-y-2">
                      {reports.tasksByClient.slice(0, 8).map((x) => (
                        <div key={x.clientName} className="flex items-center justify-between text-sm">
                          <div className="text-[var(--muted)] truncate">{x.clientName}</div>
                          <div>{x.count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {toast ? (
            <div className="border-t border-[var(--border)] p-4 bg-[var(--background)]/80 backdrop-blur">
              <div className="text-sm rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3">{toast}</div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
