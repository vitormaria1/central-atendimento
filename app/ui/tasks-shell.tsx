"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

type Department = string;
type DepartmentFilter = Department | "all";
type TaskStatus = string;
type TaskPriority = "low" | "normal" | "high" | "urgent";

type Client = { id: string; name: string };
type TaskType = { id: string; name: string };
type StatusMeta = { id: string; name: string; color: string; sortOrder: number };
type DepartmentMeta = { id: string; name: string; color: string; sortOrder: number };

type ViewType = "list" | "board" | "calendar";
type SavedView = { id: string; name: string; viewType: ViewType; department: Department | null; config: Record<string, unknown> };

type TaskListItem = {
  id: string;
  taskNumber: string;
  title: string;
  department: Department;
  status: TaskStatus;
  priority: TaskPriority;
  client: Client | null;
  taskType: TaskType | null;
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
type AuditItem = { id: string; actorName: string; eventType: string; data: unknown; createdAt: string };

function deptLabel(d: Department, departments: DepartmentMeta[]) {
  return departments.find((x) => x.id === d)?.name ?? d;
}

function statusLabel(s: TaskStatus, statuses: StatusMeta[]) {
  return statuses.find((x) => x.id === s)?.name ?? s;
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

function formatDateOnly(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, delta: number) {
  const copy = new Date(d.getTime());
  copy.setMonth(copy.getMonth() + delta);
  return copy;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function isTaskOverdue(task: { dueAt: string | null; status: TaskStatus }) {
  if (!task.dueAt || task.status === "done") return false;
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return due < startOfDayLocal(new Date());
}

function isTaskDueToday(task: { dueAt: string | null; status: TaskStatus }) {
  if (!task.dueAt || task.status === "done") return false;
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return sameDay(due, new Date());
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

function departmentTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 55% 60%)`;
}

function priorityTone(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return {
        border: "rgba(220, 38, 38, 0.16)",
        background: "rgba(220, 38, 38, 0.08)",
        text: "#b91c1c",
      };
    case "high":
      return {
        border: "rgba(217, 119, 6, 0.18)",
        background: "rgba(217, 119, 6, 0.10)",
        text: "#b45309",
      };
    case "low":
      return {
        border: "rgba(15, 154, 131, 0.16)",
        background: "rgba(15, 154, 131, 0.08)",
        text: "#0f766e",
      };
    default:
      return {
        border: "rgba(71, 85, 105, 0.16)",
        background: "rgba(71, 85, 105, 0.08)",
        text: "var(--muted)",
      };
  }
}

export default function TasksShell() {
  const router = useRouter();
  const [me, setMe] = useState<Agent | null>(null);
  const [statusMeta, setStatusMeta] = useState<StatusMeta[]>([]);
  const [departmentMeta, setDepartmentMeta] = useState<DepartmentMeta[]>([]);

  const [q, setQ] = useState("");
  const [department, setDepartment] = useState<DepartmentFilter>("all");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [assignee, setAssignee] = useState<"all" | "vanderlei" | "gustavo">("all");
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [reactionsByCommentId, setReactionsByCommentId] = useState<Record<string, ReactionSummary[]>>({});

  const [toast, setToast] = useState<string | null>(null);

  const [viewType, setViewType] = useState<ViewType>("list");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("builtin:minhas");
  const [creatingView, setCreatingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [openDepartments, setOpenDepartments] = useState<Record<string, boolean>>({});
  const [boardDraggingTaskId, setBoardDraggingTaskId] = useState<string | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => new Date());

  // create task
  const [creating, setCreating] = useState(false);
  const [newDepartment, setNewDepartment] = useState<Department>("fiscal");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newAssignee, setNewAssignee] = useState<"none" | "vanderlei" | "gustavo">("none");
  const [newDueAt, setNewDueAt] = useState("");
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [newTaskTypeId, setNewTaskTypeId] = useState<string>("outros");
  const [newTaskTypeName, setNewTaskTypeName] = useState("");
  const [creatingTaskType, setCreatingTaskType] = useState(false);

  // customization (columns/departments)
  const [showNewStatusForm, setShowNewStatusForm] = useState(false);
  const [newStatusId, setNewStatusId] = useState("");
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#64748b");
  const [creatingStatus, setCreatingStatus] = useState(false);

  const [showNewDeptForm, setShowNewDeptForm] = useState(false);
  const [newDeptId, setNewDeptId] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptColor, setNewDeptColor] = useState("#64748b");
  const [creatingDept, setCreatingDept] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const commentFileRef = useRef<HTMLInputElement | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);

  function renderInlineDetails() {
    if (!details) return <div className="text-sm text-[var(--muted)]">Selecione uma tarefa na lista.</div>;
    return (
      <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">
              <span className="text-[var(--muted)] mr-2">#{details.taskNumber}</span>
              {details.title}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              Criado em {formatTime(details.createdAt)}
              {details.createdBy ? ` • por ${details.createdBy.name}` : ""}
            </div>
            {details.taskType ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-1">
                Tipo: <span className="text-[var(--foreground)] font-medium">{details.taskType.name}</span>
              </div>
            ) : null}
          </div>
        </div>

        {details.description ? <div className="text-sm whitespace-pre-wrap">{details.description}</div> : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select
            value={details.taskType?.id ?? ""}
            disabled={me?.agentId !== "vanderlei"}
            onChange={(e) => {
              const v = e.target.value || null;
              void (async () => {
                try {
                  await patchTask(details.id, { taskTypeId: v });
                  await refreshTask(details.id);
                } catch (err) {
                  setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                }
              })();
            }}
            className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none disabled:opacity-60"
            title={me?.agentId === "vanderlei" ? "Tipo de tarefa" : "Somente Vanderlei pode alterar"}
          >
            <option value="">Sem tipo</option>
            {taskTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
            {(statusMeta.length
              ? statusMeta
              : [
                  { id: "to_do", name: "A Fazer" },
                  { id: "in_progress", name: "Em Andamento" },
                  { id: "blocked", name: "Pendente" },
                  { id: "done", name: "Concluído" },
                ]
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={details.assignee?.agentId ?? "none"}
            disabled={me?.agentId !== "vanderlei"}
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
            className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none disabled:opacity-60"
            title={me?.agentId === "vanderlei" ? "Responsável" : "Somente Vanderlei pode alterar"}
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
            {(departmentMeta.length
              ? departmentMeta
              : [
                  { id: "fiscal", name: "Fiscal" },
                  { id: "contabil", name: "Contábil" },
                  { id: "pessoal", name: "Pessoal" },
                  { id: "societario_paralegal", name: "Societário/Paralegal" },
                  { id: "administrativo", name: "Administrativo" },
                ]
            ).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
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
                        onClick={() =>
                          void toggleReaction(
                            c.id,
                            e,
                            Boolean((reactionsByCommentId[c.id] ?? []).find((x) => x.emoji === e)?.mine),
                          )
                        }
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
      </div>
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  function openAccessibilityPreferences() {
    window.dispatchEvent(new Event("codex:open-a11y-preferences"));
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

  async function loadTaskMeta() {
    const [resStatuses, resDepts] = await Promise.all([
      fetch("/api/task-statuses", { cache: "no-store" }),
      fetch("/api/task-departments", { cache: "no-store" }),
    ]);
    if (resStatuses.ok) {
      const data = (await resStatuses.json()) as { items: StatusMeta[] };
      setStatusMeta((data.items ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    }
    if (resDepts.ok) {
      const data = (await resDepts.json()) as { items: DepartmentMeta[] };
      const items = (data.items ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setDepartmentMeta(items);
      setOpenDepartments((prev) => {
        const next = { ...prev };
        for (const d of items) if (next[d.id] === undefined) next[d.id] = false;
        return next;
      });
      setDepartment((prev) => {
        if (prev === "all") return prev;
        if (items.some((x) => x.id === prev)) return prev;
        return items[0]?.id ?? prev;
      });
    }
  }

  async function createStatusColumn() {
    if (creatingStatus) return;
    const id = newStatusId.trim().toLowerCase();
    const name = newStatusName.trim();
    if (!id || !name) return;
    setCreatingStatus(true);
    try {
      const res = await fetch("/api/task-statuses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, color: newStatusColor }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Falha ao criar coluna");
      setNewStatusId("");
      setNewStatusName("");
      setNewStatusColor("#64748b");
      await loadTaskMeta();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar coluna");
    } finally {
      setCreatingStatus(false);
    }
  }

  async function createDepartment() {
    if (creatingDept) return;
    const id = newDeptId.trim().toLowerCase();
    const name = newDeptName.trim();
    if (!id || !name) return;
    setCreatingDept(true);
    try {
      const res = await fetch("/api/task-departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, color: newDeptColor }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Falha ao criar departamento");
      setNewDeptId("");
      setNewDeptName("");
      setNewDeptColor("#64748b");
      await loadTaskMeta();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar departamento");
    } finally {
      setCreatingDept(false);
    }
  }

  async function loadTaskTypes() {
    const res = await fetch("/api/task-types", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: Array<{ id: string; name: string }> };
    const items = (data.items ?? []).map((t) => ({ id: t.id, name: t.name }));
    setTaskTypes(items);
    if (items.length && !items.some((t) => t.id === newTaskTypeId)) setNewTaskTypeId(items[0]!.id);
  }

  async function createTaskType() {
    const name = newTaskTypeName.trim();
    if (!name || creatingTaskType) return;
    setCreatingTaskType(true);
    try {
      const res = await fetch("/api/task-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; name?: string; error?: string } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error ?? "Falha ao criar tipo");
      setNewTaskTypeName("");
      await loadTaskTypes();
      setNewTaskTypeId(data.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar tipo");
    } finally {
      setCreatingTaskType(false);
    }
  }

  async function loadSavedViews() {
    const url = new URL("/api/task-views", window.location.origin);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: SavedView[] };
    setSavedViews(data.items);
  }

  async function loadTasks() {
    const url = new URL("/api/tasks", window.location.origin);
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
          taskTypeId: newTaskTypeId || null,
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
      setNewTaskTypeId("outros");
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
    void loadTaskMeta();
    void loadTaskTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me) return;
    if (newAssignee === "none") setNewAssignee(me.agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  useEffect(() => {
    void loadTasks();
    void loadSavedViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, assignee]);

  useEffect(() => {
    if (department !== "all") setNewDepartment(department);
  }, [department]);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetails(null);
      setComments([]);
      setAttachments([]);
      return;
    }
    setShowCreateForm(false);
    void refreshTask(selectedTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const visibleTasks = department === "all" ? tasks : tasks.filter((task) => task.department === department);
  const taskStats = {
    total: visibleTasks.length,
    open: visibleTasks.filter((task) => task.status !== "done").length,
    overdue: visibleTasks.filter((task) => isTaskOverdue(task)).length,
    today: visibleTasks.filter((task) => isTaskDueToday(task)).length,
  };
  const selectedDepartment = department === "all" ? null : department;
  const selectedDepartmentTasks = selectedDepartment ? tasks.filter((task) => task.department === selectedDepartment) : [];
  const recentDepartmentTasks = (selectedDepartment ? selectedDepartmentTasks : tasks)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const sidebarDepartments = departmentMeta.length
    ? departmentMeta
    : [
        { id: "fiscal", name: "Fiscal" },
        { id: "contabil", name: "Contábil" },
        { id: "pessoal", name: "Pessoal" },
        { id: "societario_paralegal", name: "Societário/Paralegal" },
        { id: "administrativo", name: "Administrativo" },
      ];

  useEffect(() => {
    if (visibleTasks.length === 0) {
      if (selectedTaskId !== null) setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !visibleTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, q, status, assignee, visibleTasks.length, selectedTaskId]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen">
        <aside className="w-[360px] shrink-0 border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,var(--background))]">
          <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-[var(--surface-2)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-1)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mark.png" alt="Logo" className="h-7 w-7" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold leading-tight">Tarefas</div>
                <div className="text-xs text-[var(--muted)] leading-tight">{me ? me.agentName : "Carregando..."}</div>
              </div>
            </button>

            <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goBack}
                className="rounded-xl border px-3 py-2 text-xs border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--surface-1)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
              <button
                onClick={() => void logout()}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs hover:bg-[var(--surface-2)]"
              >
                Sair
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-[var(--border)]">
            <div className="rounded-[28px] border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,var(--background))_0%,color-mix(in_srgb,var(--card)_88%,var(--background))_100%)] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.26em] text-[var(--muted)]">Workspace</div>
                  <div className="mt-1 text-base font-semibold leading-tight">Gestão de Tarefas</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Acompanhe departamentos, prioridades e prazos.</div>
                </div>
                <button
                  type="button"
                  onClick={openAccessibilityPreferences}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                >
                  A11y
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "Total", value: tasks.length },
                  { label: "Hoje", value: taskStats.today },
                  { label: "Atraso", value: taskStats.overdue },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_90%,var(--background))] px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setDepartment("all")}
                className={[
                  "mt-3 w-full rounded-2xl border px-3 py-3 text-left transition",
                  department === "all"
                    ? "border-[color-mix(in_srgb,var(--primary)_35%,white)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_88%,var(--background))] hover:bg-[color-mix(in_srgb,var(--card)_96%,var(--background))]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Visão geral</div>
                    <div className="mt-1 text-[11px] text-[var(--muted)]">Tudo em uma única lista</div>
                  </div>
                  <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-1 text-[10px] text-[var(--muted)]">
                    {tasks.length}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_88%,var(--background))] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Departamentos</div>
              <div className="text-[11px] text-[var(--muted)]">{sidebarDepartments.length} pastas</div>
            </div>

            <div className="space-y-1.5">
              {sidebarDepartments.map((d) => {
                const deptTasks = tasks.filter((task) => task.department === d.id);
                const deptCounts = {
                  total: deptTasks.length,
                  open: deptTasks.filter((task) => task.status !== "done").length,
                  overdue: deptTasks.filter((task) => isTaskOverdue(task)).length,
                };
                const active = department === d.id;
                const expanded = openDepartments[d.id] ?? false;
                const tone = departmentTone(d.id);

                return (
                  <div
                    key={d.id}
                    className={[
                      "rounded-3xl border transition",
                      active
                        ? "border-[color-mix(in_srgb,var(--primary)_28%,white)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_86%,var(--background))] hover:bg-[color-mix(in_srgb,var(--card)_96%,var(--background))]",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setDepartment(d.id);
                        setOpenDepartments((prev) => ({ ...prev, [d.id]: !expanded }));
                      }}
                      className="group flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      <span
                        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-black/20"
                        style={{ backgroundColor: active ? "var(--primary)" : tone }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{d.name}</span>
                          {active ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" /> : null}
                        </span>
                        <span className="mt-1 block text-[11px] text-[var(--muted)]">
                          {deptCounts.open} abertas · {deptCounts.overdue} atrasadas
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--muted)]">
                        <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-1">{deptCounts.total}</span>
                        <span className="transition group-hover:text-[var(--foreground)]">{expanded ? "▾" : "▸"}</span>
                      </span>
                    </button>
                    {expanded ? (
                      <div className="border-t border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] px-3 py-2">
                        <div className="ml-3 border-l border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] pl-3 space-y-1.5">
                          {[
                            { label: "Todas", status: "all" as const, count: deptCounts.total },
                            { label: "A fazer", status: "to_do" as const, count: deptTasks.filter((task) => task.status === "to_do").length },
                            { label: "Em andamento", status: "in_progress" as const, count: deptTasks.filter((task) => task.status === "in_progress").length },
                            { label: "Bloqueadas", status: "blocked" as const, count: deptTasks.filter((task) => task.status === "blocked").length },
                            { label: "Concluídas", status: "done" as const, count: deptTasks.filter((task) => task.status === "done").length },
                          ].map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                setDepartment(d.id);
                                setStatus(item.status);
                              }}
                              className="flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left text-[11px] text-[var(--muted)] transition hover:border-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] hover:bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] hover:text-[var(--foreground)]"
                            >
                              <span>{item.label}</span>
                              <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-0.5">{item.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-[var(--border)] px-6 flex items-center justify-between bg-[var(--background)]/80 backdrop-blur">
            <div className="min-w-0 w-[260px]">
              <div className="text-sm font-semibold truncate">
                {department === "all" ? "Visão geral" : deptLabel(department, departmentMeta)}
              </div>
              <div className="text-xs text-[var(--muted)] truncate">
                {department === "all" ? "Escolha um departamento na lateral" : `${taskStats.total} tarefas visíveis`}
                {assignee !== "all" ? ` • ${assignee === "vanderlei" ? "Vanderlei" : "Gustavo"}` : ""}
                {status !== "all" ? ` • ${statusLabel(status, statusMeta)}` : ""}
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 w-[260px] justify-end">
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
              <button
                type="button"
                onClick={openAccessibilityPreferences}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
              >
                A11y
              </button>
              {me?.agentId === "vanderlei" && viewType === "board" ? (
                <button
                  type="button"
                  onClick={() => setShowNewStatusForm(true)}
                  className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                  title="Criar nova coluna do quadro"
                >
                  Nova coluna
                </button>
              ) : null}
              {me?.agentId === "vanderlei" && viewType === "list" ? (
                <button
                  type="button"
                  onClick={() => setShowNewDeptForm(true)}
                  className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                  title="Criar novo departamento"
                >
                  Novo departamento
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Nova tarefa
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    {department === "all" ? "Visão geral" : deptLabel(department, departmentMeta)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {department === "all"
                      ? "Escolha um departamento na lateral para abrir suas tarefas no centro."
                      : "Resumo rápido do departamento selecionado e suas tarefas recentes."}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
                  >
                    Nova tarefa
                  </button>
                  <button
                    type="button"
                    onClick={openAccessibilityPreferences}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                  >
                    Acessibilidade
                  </button>
                </div>
              </div>

              <div className="inline-flex rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
                {[
                  { id: "list" as const, label: "Lista" },
                  { id: "board" as const, label: "Quadro" },
                  { id: "calendar" as const, label: "Calendário" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setViewType(item.id)}
                    className={[
                      "rounded-xl px-3 py-2 text-sm transition",
                      viewType === item.id
                        ? "border border-[var(--border)] bg-[var(--surface-1)]"
                        : "hover:bg-[var(--surface-1)]",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {[
                  { label: "Total", value: taskStats.total, hint: "tarefas visíveis" },
                  { label: "Em aberto", value: taskStats.open, hint: "status != concluído" },
                  { label: "Hoje", value: taskStats.today, hint: "prazo hoje" },
                  { label: "Atrasadas", value: taskStats.overdue, hint: "prazo vencido" },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold">{item.value}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar tarefas..."
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
                />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus | "all")}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Status</option>
                  {(statusMeta.length
                    ? statusMeta
                    : [
                        { id: "to_do", name: "A Fazer" },
                        { id: "in_progress", name: "Em Andamento" },
                        { id: "blocked", name: "Pendente" },
                        { id: "done", name: "Concluído" },
                      ]
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value as typeof assignee)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Responsável</option>
                  <option value="vanderlei">Vanderlei</option>
                  <option value="gustavo">Gustavo</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadTasks()}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                >
                  Atualizar
                </button>
              </div>

              <div className="grid gap-2 xl:grid-cols-[1.2fr_0.9fr]">
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
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
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
                    className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void createSavedView()}
                    disabled={creatingView || !newViewName.trim()}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            {viewType === "list" ? (
              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
              <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {selectedDepartment ? `Tarefas de ${deptLabel(selectedDepartment, departmentMeta)}` : "Selecione um departamento"}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {selectedDepartment
                        ? "Lista de tarefas do departamento selecionado"
                        : "Clique em um departamento na lateral para carregar seu painel"}
                    </div>
                  </div>
                  {selectedDepartment ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(true)}
                      className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
                    >
                      Nova tarefa
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  {selectedDepartmentTasks.length > 0 ? (
                    selectedDepartmentTasks.slice(0, 250).map((t) => {
                      const isSelected = t.id === selectedTaskId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTaskId(t.id);
                            setShowTaskModal(true);
                          }}
                          className={[
                            "w-full rounded-2xl px-4 py-3 text-left ring-1 transition",
                            isSelected
                              ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_35%,transparent)]"
                              : "bg-white/5 ring-white/10 hover:bg-white/8",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">
                                <span className="text-[var(--muted)] mr-2">#{t.taskNumber}</span>
                                {t.title}
                              </div>
                              <div className="mt-1 text-xs text-[var(--muted)] truncate">
                                {statusLabel(t.status, statusMeta)}
                                {t.assignee ? ` • ${t.assignee.name}` : " • Sem responsável"}
                                {t.client ? ` • ${t.client.name}` : ""}
                                {t.dueAt ? ` • Vence ${formatDateOnly(t.dueAt)}` : " • Sem prazo"}
                              </div>
                            </div>
                            <div className="shrink-0 text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1">
                              {priorityLabel(t.priority)}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-5 text-sm text-[var(--muted)]">
                      Nenhuma tarefa neste departamento.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                  <div className="text-sm font-semibold">Atividade recente</div>
                  <div className="mt-4 space-y-2">
                    {recentDepartmentTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTaskId(t.id);
                          setShowTaskModal(true);
                        }}
                        className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-3 text-left hover:bg-white/8"
                      >
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="mt-1 text-xs text-[var(--muted)] truncate">
                          {statusLabel(t.status, statusMeta)} • {formatTime(t.updatedAt)}
                        </div>
                      </button>
                    ))}
                    {recentDepartmentTasks.length === 0 ? (
                      <div className="text-sm text-[var(--muted)]">Sem atividade recente.</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                  <div className="text-sm font-semibold">Detalhes rápidos</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      { label: "A fazer", value: visibleTasks.filter((task) => task.status === "to_do").length },
                      { label: "Em andamento", value: visibleTasks.filter((task) => task.status === "in_progress").length },
                      { label: "Bloqueadas", value: visibleTasks.filter((task) => task.status === "blocked").length },
                      { label: "Concluídas", value: visibleTasks.filter((task) => task.status === "done").length },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl bg-black/10 ring-1 ring-white/10 p-3">
                        <div className="text-[11px] text-[var(--muted)]">{item.label}</div>
                        <div className="mt-1 text-lg font-semibold">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            ) : viewType === "board" ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                {(statusMeta.length ? statusMeta.map((x) => x.id) : (["to_do", "in_progress", "blocked", "done"] as TaskStatus[])).map((s) => {
                  const columnTasks = visibleTasks.filter((t) => t.status === s).slice(0, 200);
                  const statusColor = statusMeta.find((x) => x.id === s)?.color ?? "#64748b";
                  return (
                    <div
                      key={s}
                      className={[
                        "min-h-[320px] rounded-[30px] border p-3 transition",
                        boardDraggingTaskId
                          ? "border-[color-mix(in_srgb,var(--primary)_22%,white)] bg-[color-mix(in_srgb,var(--primary)_7%,var(--card))]"
                          : "border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_90%,var(--background))]",
                      ].join(" ")}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/taskId") || boardDraggingTaskId;
                        if (!id) return;
                        const task = tasks.find((t) => t.id === id);
                        if (!task || task.status === s) return;
                        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: s } : t)));
                        void (async () => {
                          try {
                            await patchTask(id, { status: s });
                            await refreshTask(id);
                          } catch (err) {
                            setToast(err instanceof Error ? err.message : "Falha ao mover tarefa");
                            await loadTasks();
                          }
                        })();
                        setBoardDraggingTaskId(null);
                      }}
                    >
                      <div className="rounded-[24px] border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Coluna</div>
                            <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: statusColor }}
                              />
                              {statusLabel(s, statusMeta)}
                            </div>
                          </div>
                          <div className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_100%,var(--background))] px-2 py-1 text-[10px] text-[var(--muted)]">
                            {columnTasks.length}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-3">
                        {columnTasks.map((t) => (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/taskId", t.id);
                              setBoardDraggingTaskId(t.id);
                            }}
                            onDragEnd={() => setBoardDraggingTaskId(null)}
                            className={[
                              "cursor-grab rounded-[26px] border bg-[color-mix(in_srgb,var(--card)_98%,var(--background))] px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] active:cursor-grabbing",
                              t.id === selectedTaskId
                                ? "border-[color-mix(in_srgb,var(--primary)_30%,white)] bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))]"
                                : "border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] hover:border-[color-mix(in_srgb,var(--foreground)_12%,var(--background))]",
                            ].join(" ")}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTaskId(t.id);
                                setShowTaskModal(true);
                              }}
                              className="w-full text-left"
                            >
                              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                                {t.taskType ? t.taskType.name : "Tarefa"}
                              </div>
                              <div className="mt-2 text-base font-semibold leading-snug">{t.title}</div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                                {t.client ? (
                                  <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] px-2 py-1">
                                    {t.client.name}
                                  </span>
                                ) : null}
                                {t.assignee ? (
                                  <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] px-2 py-1">
                                    {t.assignee.name}
                                  </span>
                                ) : null}
                                {t.dueAt ? (
                                  <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] px-2 py-1">
                                    {formatDateOnly(t.dueAt)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div
                                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                                  style={{
                                    borderColor: priorityTone(t.priority).border,
                                    backgroundColor: priorityTone(t.priority).background,
                                    color: priorityTone(t.priority).text,
                                  }}
                                >
                                  {priorityLabel(t.priority)}
                                </div>
                                <div className="text-[11px] text-[var(--muted)]">#{t.taskNumber}</div>
                              </div>
                            </button>
                          </div>
                        ))}
                        {columnTasks.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => setShowCreateForm(true)}
                            className="w-full rounded-[24px] border border-dashed border-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] bg-[color-mix(in_srgb,var(--card)_94%,var(--background))] px-4 py-5 text-left text-sm text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--card)_98%,var(--background))]"
                          >
                            + Adicionar tarefa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowCreateForm(true)}
                            className="w-full rounded-[22px] px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] hover:text-[var(--foreground)]"
                          >
                            + Adicionar tarefa
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[32px] border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_90%,var(--background))] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="rounded-[24px] border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Calendário</div>
                    <div className="mt-1 text-sm font-semibold">Organize tarefas por prazo</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-[24px] border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setCalendarAnchor(new Date())}
                      className="rounded-xl px-3 py-2 text-xs hover:bg-[color-mix(in_srgb,var(--card)_90%,var(--background))]"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarAnchor((d) => addMonths(d, -1))}
                      className="rounded-xl px-3 py-2 text-xs hover:bg-[color-mix(in_srgb,var(--card)_90%,var(--background))]"
                    >
                      ←
                    </button>
                    <div className="min-w-[140px] text-center text-sm font-semibold">
                      {startOfMonth(calendarAnchor).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalendarAnchor((d) => addMonths(d, 1))}
                      className="rounded-xl px-3 py-2 text-xs hover:bg-[color-mix(in_srgb,var(--card)_90%,var(--background))]"
                    >
                      →
                    </button>
                  </div>
                </div>

                {(() => {
                  const monthStart = startOfMonth(calendarAnchor);
                  const gridStart = new Date(monthStart.getTime());
                  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
                  const days: Date[] = [];
                  for (let i = 0; i < 42; i += 1) {
                    const d = new Date(gridStart.getTime());
                    d.setDate(gridStart.getDate() + i);
                    days.push(d);
                  }
                  const byDay = new Map<string, TaskListItem[]>();
                  for (const t of visibleTasks) {
                    const d = new Date(t.dueAt ?? t.createdAt);
                    const key = dayKeyLocal(d);
                    const prev = byDay.get(key) ?? [];
                    prev.push(t);
                    byDay.set(key, prev);
                  }
                  for (const [, list] of byDay) list.sort((a, b) => (a.priority > b.priority ? -1 : 1));
                  const today = new Date();
                  const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
                  return (
                    <div className="mt-4">
                      <div className="grid grid-cols-7 gap-2 rounded-[24px] border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-2 text-xs text-[var(--muted)]">
                        {dayNames.map((n) => (
                          <div key={n} className="text-center uppercase tracking-[0.18em]">
                            {n}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-2">
                        {days.map((d) => {
                          const inMonth = d.getMonth() === monthStart.getMonth();
                          const key = dayKeyLocal(d);
                          const list = byDay.get(key) ?? [];
                          const isToday = sameDay(d, today);
                          return (
                            <div
                              key={key}
                              className={[
                                "min-h-[148px] overflow-hidden rounded-[28px] border p-2.5",
                                inMonth
                                  ? "border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_94%,var(--background))]"
                                  : "border-[color-mix(in_srgb,var(--foreground)_5%,var(--background))] bg-[color-mix(in_srgb,var(--card)_72%,var(--background))] opacity-75",
                                isToday ? "border-[color-mix(in_srgb,var(--primary)_28%,white)]" : "",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between rounded-2xl bg-[color-mix(in_srgb,var(--card)_98%,var(--background))] px-2 py-1.5">
                                <div
                                  className={[
                                    "text-xs font-semibold",
                                    isToday ? "text-[var(--foreground)]" : "text-[var(--muted)]",
                                  ].join(" ")}
                                >
                                  {d.getDate()}
                                </div>
                                <div className="text-[10px] text-[var(--muted)]">{list.length ? `${list.length} itens` : ""}</div>
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {list.slice(0, 4).map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTaskId(t.id);
                                      setShowTaskModal(true);
                                    }}
                                    className={[
                                      "w-full rounded-2xl border px-2.5 py-2 text-left text-xs transition",
                                      t.id === selectedTaskId
                                        ? "border-[color-mix(in_srgb,var(--primary)_28%,white)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
                                        : "border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_98%,var(--background))] hover:bg-[color-mix(in_srgb,var(--card)_92%,var(--background))]",
                                    ].join(" ")}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span
                                        className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full"
                                        style={{ backgroundColor: priorityTone(t.priority).text }}
                                      />
                                      <div className="min-w-0">
                                        <div className="truncate text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                                          #{t.taskNumber}
                                        </div>
                                        <div className="mt-0.5 truncate text-[12px] font-medium">{t.title}</div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                                {list.length > 4 ? (
                                  <div className="px-1 text-[10px] text-[var(--muted)]">+{list.length - 4} tarefas</div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
                {showCreateForm ? (
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">Criar tarefa</div>
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                      >
                        Fechar
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3">
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value as Department)}
                      className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                    >
                      {(departmentMeta.length
                        ? departmentMeta
                        : [
                            { id: "fiscal", name: "Fiscal" },
                            { id: "contabil", name: "Contábil" },
                            { id: "pessoal", name: "Pessoal" },
                            { id: "societario_paralegal", name: "Societário/Paralegal" },
                            { id: "administrativo", name: "Administrativo" },
                          ]
                      ).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={newTaskTypeId}
                          onChange={(e) => setNewTaskTypeId(e.target.value)}
                          className="col-span-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                          title="Tipo de tarefa"
                        >
                          {taskTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                          {taskTypes.length === 0 ? <option value="outros">Outros</option> : null}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const v = (newTaskTypeName || "").trim();
                            if (!v) return;
                            void createTaskType();
                          }}
                          disabled={creatingTaskType || newTaskTypeName.trim().length < 2}
                          className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8 disabled:opacity-60"
                          title="Criar novo tipo"
                        >
                          {creatingTaskType ? "..." : "Novo"}
                        </button>
                      </div>
                      <input
                        value={newTaskTypeName}
                        onChange={(e) => setNewTaskTypeName(e.target.value)}
                        placeholder="Novo tipo (ex.: Regularização)"
                        className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                      />
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

                      <button
                        type="button"
                        onClick={() => void createTask()}
                        disabled={creating || newTitle.trim().length === 0}
                        className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {creating ? "Criando..." : "Criar tarefa"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {details ? (
                  <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate">
                      <span className="text-[var(--muted)] mr-2">#{details.taskNumber}</span>
                      {details.title}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      Criado em {formatTime(details.createdAt)}{details.createdBy ? ` • por ${details.createdBy.name}` : ""}
                    </div>
                    {details.taskType ? (
                      <div className="mt-2 inline-flex items-center gap-2 text-xs rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-1">
                        Tipo: <span className="text-[var(--foreground)] font-medium">{details.taskType.name}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {details.description ? <div className="text-sm whitespace-pre-wrap">{details.description}</div> : null}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <select
                    value={details.taskType?.id ?? ""}
                    disabled={me?.agentId !== "vanderlei"}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      void (async () => {
                        try {
                          await patchTask(details.id, { taskTypeId: v });
                          await refreshTask(details.id);
                        } catch (err) {
                          setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                        }
                      })();
                    }}
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none disabled:opacity-60"
                    title={me?.agentId === "vanderlei" ? "Tipo de tarefa" : "Somente Vanderlei pode alterar"}
                  >
                    <option value="">Sem tipo</option>
                    {taskTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
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
                    disabled={me?.agentId !== "vanderlei"}
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
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none disabled:opacity-60"
                    title={me?.agentId === "vanderlei" ? "Responsável" : "Somente Vanderlei pode alterar"}
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
              </div>

            {showCreateForm ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowCreateForm(false);
                }}
              >
                <div className="w-full max-w-2xl rounded-3xl bg-[color-mix(in_srgb,var(--background)_92%,black)] ring-1 ring-white/10 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Nova tarefa</div>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value as Department)}
                      className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                    >
                      {(departmentMeta.length
                        ? departmentMeta
                        : [
                            { id: "fiscal", name: "Fiscal" },
                            { id: "contabil", name: "Contábil" },
                            { id: "pessoal", name: "Pessoal" },
                            { id: "societario_paralegal", name: "Societário/Paralegal" },
                            { id: "administrativo", name: "Administrativo" },
                          ]
                      ).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={newTaskTypeId}
                        onChange={(e) => setNewTaskTypeId(e.target.value)}
                        className="col-span-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                        title="Tipo de tarefa"
                      >
                        {taskTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                        {taskTypes.length === 0 ? <option value="outros">Outros</option> : null}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const v = (newTaskTypeName || "").trim();
                          if (!v) return;
                          void createTaskType();
                        }}
                        disabled={creatingTaskType || newTaskTypeName.trim().length < 2}
                        className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm hover:bg-white/8 disabled:opacity-60"
                        title="Criar novo tipo"
                      >
                        {creatingTaskType ? "..." : "Novo"}
                      </button>
                    </div>

                    <input
                      value={newTaskTypeName}
                      onChange={(e) => setNewTaskTypeName(e.target.value)}
                      placeholder="Novo tipo (ex.: Regularização)"
                      className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                    />

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

                    <button
                      type="button"
                      onClick={() => void createTask()}
                      disabled={creating || newTitle.trim().length === 0}
                      className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {creating ? "Criando..." : "Criar tarefa"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {showTaskModal ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowTaskModal(false);
                }}
              >
                <div className="w-full max-w-4xl max-h-[86vh] overflow-y-auto rounded-3xl bg-[color-mix(in_srgb,var(--background)_92%,black)] ring-1 ring-white/10 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Editar tarefa</div>
                    <button
                      type="button"
                      onClick={() => setShowTaskModal(false)}
                      className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="mt-4">{details ? renderInlineDetails() : <div className="text-sm text-[var(--muted)]">Carregando...</div>}</div>
                </div>
              </div>
            ) : null}

            {showNewStatusForm ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowNewStatusForm(false);
                }}
              >
                <div className="w-full max-w-xl rounded-3xl bg-[color-mix(in_srgb,var(--background)_92%,black)] ring-1 ring-white/10 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Nova coluna (Quadro)</div>
                    <button
                      type="button"
                      onClick={() => setShowNewStatusForm(false)}
                      className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <input
                      value={newStatusName}
                      onChange={(e) => setNewStatusName(e.target.value)}
                      placeholder="Nome (ex.: Revisão)"
                      className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                    />
                    <div className="grid grid-cols-[1fr,56px] gap-2">
                      <input
                        value={newStatusId}
                        onChange={(e) => setNewStatusId(e.target.value)}
                        placeholder="ID (ex.: revisao)"
                        className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                      />
                      <input
                        type="color"
                        value={newStatusColor}
                        onChange={(e) => setNewStatusColor(e.target.value)}
                        className="h-10 w-full rounded-2xl bg-white/5 ring-1 ring-white/10 p-1"
                        title="Cor"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void createStatusColumn()}
                      disabled={creatingStatus || !newStatusId.trim() || !newStatusName.trim()}
                      className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {creatingStatus ? "Criando..." : "Criar coluna"}
                    </button>
                    <div className="text-[11px] text-[var(--muted)]">Use apenas letras minúsculas, números e _ no ID.</div>
                  </div>
                </div>
              </div>
            ) : null}

            {showNewDeptForm ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowNewDeptForm(false);
                }}
              >
                <div className="w-full max-w-xl rounded-3xl bg-[color-mix(in_srgb,var(--background)_92%,black)] ring-1 ring-white/10 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Novo departamento (Lista)</div>
                    <button
                      type="button"
                      onClick={() => setShowNewDeptForm(false)}
                      className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <input
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      placeholder="Nome (ex.: Jurídico)"
                      className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                    />
                    <div className="grid grid-cols-[1fr,56px] gap-2">
                      <input
                        value={newDeptId}
                        onChange={(e) => setNewDeptId(e.target.value)}
                        placeholder="ID (ex.: juridico)"
                        className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                      />
                      <input
                        type="color"
                        value={newDeptColor}
                        onChange={(e) => setNewDeptColor(e.target.value)}
                        className="h-10 w-full rounded-2xl bg-white/5 ring-1 ring-white/10 p-1"
                        title="Cor"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void createDepartment()}
                      disabled={creatingDept || !newDeptId.trim() || !newDeptName.trim()}
                      className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {creatingDept ? "Criando..." : "Criar departamento"}
                    </button>
                    <div className="text-[11px] text-[var(--muted)]">Use apenas letras minúsculas, números e _ no ID.</div>
                  </div>
                </div>
              </div>
            ) : null}
          {toast ? (
            <div className="border-t border-[var(--border)] p-4 bg-[var(--background)]/80 backdrop-blur">
              <div
                className="text-sm rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3"
                role="alert"
                aria-live="assertive"
              >
                {toast}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
