"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SystemNotifications from "./system-notifications";

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
type TimeRange = "all" | "7d" | "30d" | "90d" | "365d";
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
  parentTaskId: string | null;
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

function summarizeAudit(item: AuditItem, statuses: StatusMeta[], departments: DepartmentMeta[]) {
  if (item.eventType !== "task_updated" || !item.data || typeof item.data !== "object") return "Atualização registrada na tarefa.";
  const rawChanges = (item.data as { changes?: Record<string, { from: unknown; to: unknown }> }).changes;
  if (!rawChanges) return "Atualização registrada na tarefa.";
  const labels: Record<string, string> = {
    status: "status",
    assigneeAgentId: "responsável",
    dueAt: "prazo",
    priority: "prioridade",
    department: "departamento",
  };
  const parts = Object.entries(rawChanges).map(([key, change]) => {
    const label = labels[key] ?? key;
    let toValue = change.to;
    if (key === "status" && typeof toValue === "string") toValue = statusLabel(toValue, statuses);
    if (key === "department" && typeof toValue === "string") toValue = deptLabel(toValue, departments);
    if (key === "dueAt" && typeof toValue === "string") toValue = formatDateOnly(toValue);
    if (key === "priority" && typeof toValue === "string") toValue = priorityLabel(toValue as TaskPriority);
    return `${label}: ${toValue ?? "vazio"}`;
  });
  return parts.length > 0 ? parts.join(" • ") : "Atualização registrada na tarefa.";
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

function taskMatchesTimeRange(task: { createdAt: string }, range: TimeRange) {
  if (range === "all") return true;
  const createdAt = new Date(task.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  const now = new Date();
  const start = new Date(now.getTime());
  if (range === "7d") start.setDate(now.getDate() - 7);
  if (range === "30d") start.setDate(now.getDate() - 30);
  if (range === "90d") start.setDate(now.getDate() - 90);
  if (range === "365d") start.setFullYear(now.getFullYear() - 1);
  return createdAt >= start && createdAt <= now;
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

type ChoiceOption = {
  value: string;
  label: string;
};

function ChoiceSelect({
  value,
  options,
  placeholder,
  onChange,
  title,
}: {
  value: string;
  options: ChoiceOption[];
  placeholder: string;
  onChange: (value: string) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selected = options.find((opt) => opt.value === value) ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-left text-sm text-[var(--foreground)] shadow-sm outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "" : "text-[var(--muted)]"}>{selected?.label ?? placeholder}</span>
        <span className="ml-3 text-[var(--muted)]">▾</span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-[var(--surface-1)]",
                  active ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--foreground)]" : "text-[var(--foreground)]",
                ].join(" ")}
              >
                <span>{opt.label}</span>
                {active ? <span className="text-[var(--primary)]">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [reactionsByCommentId, setReactionsByCommentId] = useState<Record<string, ReactionSummary[]>>({});
  const [subtasks, setSubtasks] = useState<TaskListItem[]>([]);

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
  const [deletingTask, setDeletingTask] = useState(false);
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
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskDescription, setNewSubtaskDescription] = useState("");
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<TaskPriority>("normal");
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState<"none" | "vanderlei" | "gustavo">("none");
  const [newSubtaskDueAt, setNewSubtaskDueAt] = useState("");
  const [newSubtaskTaskTypeId, setNewSubtaskTaskTypeId] = useState("");
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  function renderInlineDetails() {
    if (!details) return <div className="text-sm text-[var(--muted)]">Selecione uma tarefa na lista.</div>;
    return (
      <div className="grid min-h-[70vh] grid-cols-1 overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] xl:grid-cols-[minmax(0,1.8fr)_420px]">
        <div className="min-w-0 overflow-y-auto p-7">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5">Tarefa</span>
            <span className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5">#{details.taskNumber}</span>
            {details.taskType ? (
              <span className="rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1.5 text-[var(--foreground)]">
                {details.taskType.name}
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <h2 className="text-3xl font-semibold tracking-tight">{details.title}</h2>
            <div className="mt-2 text-sm text-[var(--muted)]">
              Criada em {formatTime(details.createdAt)}
              {details.createdBy ? ` • por ${details.createdBy.name}` : ""}
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] px-5 py-4 text-sm text-[var(--muted)]">
            Estruture status, responsáveis e contexto da tarefa com clareza para o time.
          </div>

          <div className="mt-8 rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] px-6 py-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Campos principais</div>
            <div className="mt-5 grid gap-x-10 gap-y-5 md:grid-cols-2">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-[var(--muted)]">◉</span>
                  Status
                </div>
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
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm outline-none"
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
              </div>

              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-[var(--muted)]">👤</span>
                  Responsável
                </div>
              <select
                value={details.assignee?.agentId ?? "none"}
                disabled={!me}
                onChange={(e) => {
                  const v = e.target.value as "none" | "vanderlei" | "gustavo";
                  void (async () => {
                    try {
                      await changeTaskAssignee(details.id, v === "none" ? null : v);
                    } catch (err) {
                      setToast(err instanceof Error ? err.message : "Falha ao atualizar");
                    }
                  })();
                }}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm outline-none disabled:opacity-60"
                title="Responsável"
              >
                <option value="none">Sem responsável</option>
                <option value="vanderlei">Vanderlei</option>
                <option value="gustavo">Gustavo</option>
              </select>
              </div>

              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-[var(--muted)]">⚑</span>
                  Prioridade
                </div>
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
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm outline-none"
              >
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
              </div>

              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-[var(--muted)]">▤</span>
                  Departamento
                </div>
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
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm outline-none"
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

              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-[var(--muted)]">◌</span>
                  Tipo
                </div>
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
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm outline-none disabled:opacity-60"
                title={me?.agentId === "vanderlei" ? "Tipo de tarefa" : "Somente Vanderlei pode alterar"}
              >
                <option value="">Sem tipo</option>
                {taskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              </div>

              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-[var(--muted)]">🗓</span>
                  Prazo
                </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm">
                {details.dueAt ? formatDateOnly(details.dueAt) : "Sem prazo definido"}
              </div>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-[var(--border)] pt-8">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-semibold">Descrição</div>
              <div className="text-xs text-[var(--muted)]">Contexto principal da entrega</div>
            </div>
            <div className="mt-4 rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] px-6 py-6 text-sm leading-7 text-[var(--muted)]">
              {details.description ? (
                <div className="whitespace-pre-wrap text-[var(--foreground)]">{details.description}</div>
              ) : (
                <div>Sem descrição no momento.</div>
              )}
            </div>
          </div>

          <div className="mt-10 border-t border-[var(--border)] pt-8">
            <div className="text-2xl font-semibold">Campos adicionais</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Cliente</div>
                <div className="mt-2 text-sm">{details.client?.name ?? "Não vinculado"}</div>
              </div>
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Arquivos</div>
                <div className="mt-2 text-sm">{attachments.length} arquivo(s)</div>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-[var(--border)] pt-8">
            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold">Subtarefas</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">Quebre a entrega principal em tarefas menores com acompanhamento próprio.</div>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1 text-xs text-[var(--muted)]">
                    {subtasks.length} item(ns)
                  </div>
                </div>

                {me?.agentId === "vanderlei" ? (
                  <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Nova subtarefa</div>
                    <div className="grid gap-3">
                      <input
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        placeholder="Ex.: Revisar documentos do cliente"
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                      />
                      <textarea
                        value={newSubtaskDescription}
                        onChange={(e) => setNewSubtaskDescription(e.target.value)}
                        rows={3}
                        placeholder="Descrição da subtarefa"
                        className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={newSubtaskAssignee}
                          onChange={(e) => setNewSubtaskAssignee(e.target.value as typeof newSubtaskAssignee)}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                        >
                          <option value="none">Sem responsável</option>
                          <option value="vanderlei">Vanderlei</option>
                          <option value="gustavo">Gustavo</option>
                        </select>
                        <select
                          value={newSubtaskPriority}
                          onChange={(e) => setNewSubtaskPriority(e.target.value as TaskPriority)}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                        >
                          <option value="low">Baixa</option>
                          <option value="normal">Normal</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          type="date"
                          value={newSubtaskDueAt}
                          onChange={(e) => setNewSubtaskDueAt(e.target.value)}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                        />
                        <select
                          value={newSubtaskTaskTypeId}
                          onChange={(e) => setNewSubtaskTaskTypeId(e.target.value)}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                        >
                          <option value="">Sem tipo</option>
                          {taskTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void createSubtask(details)}
                        disabled={creatingSubtask || newSubtaskTitle.trim().length === 0}
                        className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 md:self-end"
                      >
                        {creatingSubtask ? "Criando..." : "Adicionar subtarefa"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-3">
                  {subtasks.length > 0 ? (
                    subtasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setShowTaskModal(true);
                        }}
                        className="w-full rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-4 text-left transition hover:bg-[var(--surface-2)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--muted)]">
                                #{task.taskNumber}
                              </span>
                              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--muted)]">
                                {statusLabel(task.status, statusMeta)}
                              </span>
                            </div>
                            <div className="mt-2 truncate text-sm font-semibold">{task.title}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                              <span>{task.assignee?.name ?? "Sem responsável"}</span>
                              <span>•</span>
                              <span>{priorityLabel(task.priority)}</span>
                              <span>•</span>
                              <span>{task.dueAt ? `Vence ${formatDateOnly(task.dueAt)}` : "Sem prazo"}</span>
                            </div>
                          </div>
                          <div
                            className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                            style={{
                              borderColor: priorityTone(task.priority).border,
                              backgroundColor: priorityTone(task.priority).background,
                              color: priorityTone(task.priority).text,
                            }}
                          >
                            {priorityLabel(task.priority)}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-5 py-6 text-sm text-[var(--muted)]">
                      Nenhuma subtarefa criada para esta entrega.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold">Anexos</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">Envie e consulte arquivos sem sair da leitura da tarefa.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                  >
                    Enviar arquivo
                  </button>
                </div>
                <div className="mt-5 space-y-2">
                  {attachments.length > 0 ? (
                    attachments.map((a) => (
                      <a
                        key={a.id}
                        href={`/api/tasks/attachments/download?id=${encodeURIComponent(a.id)}`}
                        className="flex items-center justify-between gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
                      >
                        <span className="min-w-0 truncate">{a.filename}</span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">{formatTime(a.createdAt)}</span>
                      </a>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-4 py-6 text-sm text-[var(--muted)]">
                      Sem anexos nesta tarefa.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-[var(--border)] bg-[var(--surface-2)] xl:border-l xl:border-t-0">
          <div className="flex h-full flex-col">
            <div className="border-b border-[var(--border)] px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Atividade</div>
                  <div className="mt-1 text-2xl font-semibold">Linha do tempo</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">Comentários, arquivos e interações da tarefa.</div>
                </div>
                <button
                  type="button"
                  onClick={() => commentTextareaRef.current?.focus()}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
                >
                  Comentar
                </button>
              </div>
            </div>

            <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-5 py-4">
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Novo comentário</div>
                <textarea
                  ref={commentTextareaRef}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                  placeholder="Escreva um comentário... (use @vanderlei / @gustavo)"
                  className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="cursor-pointer rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs hover:bg-[var(--surface-2)]">
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
                  <div className="min-w-0 flex-1 truncate text-right text-xs text-[var(--muted)]">
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
                    {commentSending ? "Enviando..." : "Responder"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
                <div className="text-xs text-[var(--muted)]">Criada por</div>
                <div className="mt-2 text-sm font-medium">
                  {details.createdBy?.name ?? "Sistema"} • {formatTime(details.createdAt)}
                </div>
              </div>

              {audit.map((item) => (
                <div key={item.id} className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{item.actorName}</div>
                    <div className="text-[11px] text-[var(--muted)]">{formatTime(item.createdAt)}</div>
                  </div>
                  <div className="mt-3 text-sm text-[var(--muted)]">{summarizeAudit(item, statusMeta, departmentMeta)}</div>
                </div>
              ))}

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

              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm font-semibold truncate">{c.authorName}</div>
                      <div className="shrink-0 text-[11px] text-[var(--muted)]">{formatTime(c.createdAt)}</div>
                    </div>
                    <div className="mt-3 text-sm whitespace-pre-wrap">{renderWithMentions(c.body)}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(reactionsByCommentId[c.id] ?? []).map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => void toggleReaction(c.id, r.emoji, r.mine)}
                          className={[
                            "rounded-full px-3 py-1 text-xs ring-1 transition",
                            r.mine
                              ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
                              : "bg-[var(--surface-2)] ring-[var(--border)] hover:bg-[var(--surface-1)]",
                          ].join(" ")}
                        >
                          {r.emoji} {r.count}
                        </button>
                      ))}
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
                          className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs ring-1 ring-[var(--border)] hover:bg-[var(--surface-1)]"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    );
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
      setTimeRange("all");
    }
    if (id === "builtin:urgentes_hoje") {
      setAssignee(me?.agentId ?? "all");
      setStatus("all");
      setQ("");
      setTimeRange("7d");
      // nothing else; backend will filter in UI by due date when rendering calendar/list
    }
    if (id === "builtin:atrasadas") {
      setAssignee(me?.agentId ?? "all");
      setStatus("all");
      setQ("");
      setTimeRange("all");
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
    url.searchParams.set("rootOnly", "true");
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

  async function loadTaskSubtasks(taskId: string) {
    const url = new URL("/api/tasks", window.location.origin);
    url.searchParams.set("parentTaskId", taskId);
    url.searchParams.set("limit", "200");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      setSubtasks([]);
      return;
    }
    const data = (await res.json()) as { items: TaskListItem[] };
    setSubtasks(data.items);
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
    await Promise.all([loadTaskDetails(taskId), loadTaskComments(taskId), loadTaskAttachments(taskId), loadTaskAudit(taskId), loadTaskSubtasks(taskId)]);
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

  async function changeTaskAssignee(taskId: string, assigneeAgentId: "vanderlei" | "gustavo" | null) {
    await patchTask(taskId, { assigneeAgentId });

    if (me?.agentId === "gustavo" && assigneeAgentId !== "gustavo") {
      setShowTaskModal(false);
      setSelectedTaskId(null);
      await loadTasks();
      setToast("Tarefa reatribuida");
      return;
    }

    await refreshTask(taskId);
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

  async function deleteTask(taskId: string) {
    setDeletingTask(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; title?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Falha ao excluir tarefa");

      setShowTaskModal(false);
      setSelectedTaskId(null);
      setDetails(null);
      setComments([]);
      setAttachments([]);
      setAudit([]);
      setSubtasks([]);
      await loadTasks();
      setToast(data?.title ? `Tarefa excluida: ${data.title}` : "Tarefa excluida");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao excluir tarefa");
    } finally {
      setDeletingTask(false);
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

  async function createSubtask(parent: TaskDetails) {
    const title = newSubtaskTitle.trim();
    if (!title || creatingSubtask) return;
    setCreatingSubtask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: newSubtaskDescription.trim() || undefined,
          department: parent.department,
          priority: newSubtaskPriority,
          assigneeAgentId: newSubtaskAssignee === "none" ? null : newSubtaskAssignee,
          taskTypeId: newSubtaskTaskTypeId || null,
          clientId: parent.client?.id ?? undefined,
          dueAt: newSubtaskDueAt ? new Date(newSubtaskDueAt).toISOString() : null,
          parentTaskId: parent.id,
        }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error ?? "Falha ao criar subtarefa");
      setNewSubtaskTitle("");
      setNewSubtaskDescription("");
      setNewSubtaskPriority(parent.priority);
      setNewSubtaskAssignee((parent.assignee?.agentId as "vanderlei" | "gustavo" | undefined) ?? "none");
      setNewSubtaskDueAt(parent.dueAt ? parent.dueAt.slice(0, 10) : "");
      setNewSubtaskTaskTypeId(parent.taskType?.id ?? "");
      await refreshTask(parent.id);
      setSelectedTaskId(parent.id);
      setShowTaskModal(true);
      setToast("Subtarefa criada");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao criar subtarefa");
    } finally {
      setCreatingSubtask(false);
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
        timeRange,
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
      setSubtasks([]);
      return;
    }
    setShowCreateForm(false);
    void refreshTask(selectedTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId]);

  useEffect(() => {
    if (!details) return;
    setNewSubtaskPriority(details.priority);
    setNewSubtaskAssignee((details.assignee?.agentId as "vanderlei" | "gustavo" | undefined) ?? "none");
    setNewSubtaskDueAt(details.dueAt ? details.dueAt.slice(0, 10) : "");
    setNewSubtaskTaskTypeId(details.taskType?.id ?? "");
    setNewSubtaskDescription("");
    setNewSubtaskTitle("");
  }, [details]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filteredByTimeTasks = tasks.filter((task) => taskMatchesTimeRange(task, timeRange));
  const visibleTasks =
    department === "all" ? filteredByTimeTasks : filteredByTimeTasks.filter((task) => task.department === department);
  const taskStats = {
    total: visibleTasks.length,
    open: visibleTasks.filter((task) => task.status !== "done").length,
    overdue: visibleTasks.filter((task) => isTaskOverdue(task)).length,
    today: visibleTasks.filter((task) => isTaskDueToday(task)).length,
  };
  const selectedDepartment = department === "all" ? null : department;
  const selectedDepartmentTasks = selectedDepartment ? visibleTasks : [];
  const sidebarDepartments = departmentMeta.length
    ? departmentMeta
    : [
        { id: "fiscal", name: "Fiscal" },
        { id: "contabil", name: "Contábil" },
        { id: "pessoal", name: "Pessoal" },
        { id: "societario_paralegal", name: "Societário/Paralegal" },
        { id: "administrativo", name: "Administrativo" },
      ];
  const overviewDepartmentStats = sidebarDepartments
    .map((item) => {
      const deptTasks = filteredByTimeTasks.filter((task) => task.department === item.id);
      return {
        id: item.id,
        label: item.name,
        total: deptTasks.length,
        open: deptTasks.filter((task) => task.status !== "done").length,
        overdue: deptTasks.filter((task) => isTaskOverdue(task)).length,
      };
    })
    .sort((a, b) => b.total - a.total);
  const overviewStatusStats = (
    statusMeta.length
      ? statusMeta.map((item) => ({ id: item.id, label: item.name }))
      : [
          { id: "to_do", label: "A Fazer" },
          { id: "in_progress", label: "Em Andamento" },
          { id: "blocked", label: "Pendente" },
          { id: "done", label: "Concluído" },
        ]
  ).map((item) => ({
    id: item.id,
    label: item.label,
    value: visibleTasks.filter((task) => task.status === item.id).length,
  }));
  const overviewPriorityStats = (["urgent", "high", "normal", "low"] as TaskPriority[]).map((priority) => ({
    id: priority,
    label: priorityLabel(priority),
    value: visibleTasks.filter((task) => task.priority === priority).length,
  }));
  const overviewAssigneeStats = [
    { id: "vanderlei", label: "Vanderlei" },
    { id: "gustavo", label: "Gustavo" },
    { id: "none", label: "Sem responsável" },
  ].map((item) => ({
    ...item,
    value:
      item.id === "none"
        ? visibleTasks.filter((task) => !task.assignee).length
        : visibleTasks.filter((task) => task.assignee?.agentId === item.id).length,
  }));
  const nextDueTasks = visibleTasks
    .filter((task) => task.dueAt)
    .slice()
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
    .slice(0, 5);
  const departmentMax = Math.max(1, ...overviewDepartmentStats.map((item) => item.total));
  const assigneeMax = Math.max(1, ...overviewAssigneeStats.map((item) => item.value));
  const doneCount = overviewStatusStats.find((item) => item.id === "done")?.value ?? 0;
  const assignedCount = overviewAssigneeStats.find((item) => item.id === "vanderlei")?.value ?? 0
    + (overviewAssigneeStats.find((item) => item.id === "gustavo")?.value ?? 0);
  const completionPct = taskStats.total ? Math.round((doneCount / taskStats.total) * 100) : 0;
  const assignmentPct = taskStats.total ? Math.round((assignedCount / taskStats.total) * 100) : 0;
  const overdueRiskPct = taskStats.open ? Math.round((taskStats.overdue / taskStats.open) * 100) : 0;
  const weekProjectionPct = Math.max(
    0,
    Math.min(100, Math.round(completionPct * 0.5 + assignmentPct * 0.25 + (100 - overdueRiskPct) * 0.25)),
  );
  const buildConicGradient = (items: Array<{ value: number; color: string }>) => {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) return "conic-gradient(var(--surface-2) 0 100%)";
    let offset = 0;
    const segments = items
      .filter((item) => item.value > 0)
      .map((item) => {
        const start = offset;
        const end = offset + (item.value / total) * 100;
        offset = end;
        return `${item.color} ${start}% ${end}%`;
      });
    return `conic-gradient(${segments.join(", ")})`;
  };
  const statusDonut = buildConicGradient(
    overviewStatusStats.map((item) => ({
      value: item.value,
      color:
        statusMeta.find((statusItem) => statusItem.id === item.id)?.color ??
        (
          {
            to_do: "#94a3b8",
            in_progress: "#3b82f6",
            blocked: "#f97316",
            done: "#22c55e",
          } as Record<string, string>
        )[item.id] ??
        "#64748b",
    })),
  );
  const priorityDonut = buildConicGradient(
    overviewPriorityStats.map((item) => ({
      value: item.value,
      color:
        (
          {
            urgent: "#ef4444",
            high: "#f59e0b",
            normal: "#3b82f6",
            low: "#22c55e",
          } as Record<string, string>
        )[item.id] ?? "#64748b",
      })),
  );
  const visibleTaskIdsKey = visibleTasks.map((task) => task.id).join(",");
  const createTaskDepartmentOptions = (
    departmentMeta.length
      ? departmentMeta
      : [
          { id: "fiscal", name: "Fiscal" },
          { id: "contabil", name: "Contábil" },
          { id: "pessoal", name: "Pessoal" },
          { id: "societario_paralegal", name: "Societário/Paralegal" },
          { id: "administrativo", name: "Administrativo" },
        ]
  ).map((d) => ({ value: d.id, label: d.name }));
  const createTaskTypeOptions =
    taskTypes.length > 0 ? taskTypes.map((t) => ({ value: t.id, label: t.name })) : [{ value: "outros", label: "Outros" }];
  const createTaskAssigneeOptions =
    me?.agentId === "gustavo"
      ? [{ value: "gustavo", label: "Gustavo" }]
      : [
          { value: "none", label: "Sem responsável" },
          { value: "vanderlei", label: "Vanderlei" },
          { value: "gustavo", label: "Gustavo" },
        ];
  const createTaskPriorityOptions = [
    { value: "low", label: "Baixa" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" },
  ];

  useEffect(() => {
    if (showTaskModal) return;
    if (visibleTasks.length === 0) {
      if (selectedTaskId !== null) setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !visibleTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, q, status, assignee, timeRange, visibleTaskIdsKey, selectedTaskId, showTaskModal]);

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
              <SystemNotifications />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] bg-[color-mix(in_srgb,var(--card)_88%,var(--background))] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Departamentos</div>
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-[var(--muted)]">{sidebarDepartments.length} pastas</div>
                {me?.agentId === "vanderlei" ? (
                  <button
                    type="button"
                    onClick={() => setShowNewDeptForm(true)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] hover:bg-[var(--surface-2)]"
                    title="Criar novo departamento"
                  >
                    + Pasta
                  </button>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDepartment("all")}
              className={[
                "mb-3 w-full rounded-3xl border px-3 py-3 text-left transition",
                department === "all"
                  ? "border-[color-mix(in_srgb,var(--primary)_35%,white)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_88%,var(--background))] hover:bg-[color-mix(in_srgb,var(--card)_96%,var(--background))]",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Visão geral</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">Painel consolidado da operação</div>
                </div>
                <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] bg-[color-mix(in_srgb,var(--card)_96%,var(--background))] px-2 py-1 text-[10px] text-[var(--muted)]">
                  {filteredByTimeTasks.length}
                </span>
              </div>
            </button>

            <div className="space-y-1.5">
              {sidebarDepartments.map((d) => {
                const deptTasks = filteredByTimeTasks.filter((task) => task.department === d.id);
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
                {department === "all" ? "Painel consolidado da operação" : `${taskStats.total} tarefas visíveis`}
                {assignee !== "all" ? ` • ${assignee === "vanderlei" ? "Vanderlei" : "Gustavo"}` : ""}
                {status !== "all" ? ` • ${statusLabel(status, statusMeta)}` : ""}
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 justify-end">
              {selectedDepartment ? (
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
                        "rounded-xl px-3 py-2 text-xs transition",
                        viewType === item.id
                          ? "border border-[var(--border)] bg-[var(--surface-1)]"
                          : "hover:bg-[var(--surface-1)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              >
                ← Voltar
              </button>
              {me?.agentId === "vanderlei" && selectedDepartment && viewType === "board" ? (
                <button
                  type="button"
                  onClick={() => setShowNewStatusForm(true)}
                  className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                  title="Criar nova coluna do quadro"
                >
                  Nova coluna
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
            {department === "all" ? (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Visão geral</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    Leia a operação por volume, prazos e distribuição entre departamentos.
                  </div>
                </div>
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

              <div className="grid gap-2 xl:grid-cols-[1.35fr_0.8fr_0.8fr_0.8fr_0.8fr]">
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
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Período</option>
                  <option value="7d">7 dias</option>
                  <option value="30d">30 dias</option>
                  <option value="90d">3 meses</option>
                  <option value="365d">12 meses</option>
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
                    const cfgTimeRange = (cfg.timeRange as TimeRange | undefined) ?? "all";
                    setQ(cfgQ);
                    setStatus(cfgStatus);
                    setAssignee(cfgAssignee);
                    setTimeRange(cfgTimeRange);
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
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar tarefas..."
                  className="min-w-[220px] flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
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
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Período</option>
                  <option value="7d">7 dias</option>
                  <option value="30d">30 dias</option>
                  <option value="90d">3 meses</option>
                  <option value="365d">12 meses</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadTasks()}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                >
                  Atualizar
                </button>
              </div>
            )}

            {viewType === "list" ? (
              selectedDepartment ? (
                <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Departamento</div>
                      <div className="mt-1 text-base font-semibold">Tarefas de {deptLabel(selectedDepartment, departmentMeta)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(true)}
                      className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
                    >
                      Nova tarefa
                    </button>
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
                              "w-full rounded-[26px] border px-4 py-3 text-left transition",
                              isSelected
                                ? "border-[color-mix(in_srgb,var(--primary)_35%,white)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                                : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">
                                  <span className="mr-2 text-[var(--muted)]">#{t.taskNumber}</span>
                                  {t.title}
                                </div>
                                <div className="mt-1 text-xs text-[var(--muted)] truncate">
                                  {statusLabel(t.status, statusMeta)}
                                  {t.assignee ? ` • ${t.assignee.name}` : " • Sem responsável"}
                                  {t.client ? ` • ${t.client.name}` : ""}
                                  {t.dueAt ? ` • Vence ${formatDateOnly(t.dueAt)}` : " • Sem prazo"}
                                </div>
                              </div>
                              <div className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px]">
                                {priorityLabel(t.priority)}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[26px] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-8 text-sm text-[var(--muted)]">
                        Nenhuma tarefa encontrada para este departamento com os filtros atuais.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-4">
                    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Carga</div>
                          <div className="mt-1 text-base font-semibold">Departamentos mais ativos</div>
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">{overviewDepartmentStats.length} departamentos</div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {overviewDepartmentStats.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setDepartment(item.id as Department)}
                            className="w-full rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-left transition hover:bg-[var(--surface-2)]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{item.label}</div>
                                <div className="mt-1 text-xs text-[var(--muted)]">
                                  {item.open} abertas • {item.overdue} atrasadas
                                </div>
                              </div>
                              <div className="shrink-0 text-sm font-semibold">{item.total}</div>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-[var(--surface-2)]">
                              <div
                                className="h-2 rounded-full bg-[var(--primary)]"
                                style={{ width: `${(item.total / departmentMax) * 100}%` }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Prazos</div>
                          <div className="mt-1 text-base font-semibold">Próximas entregas</div>
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">Ordenado por vencimento</div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {nextDueTasks.length > 0 ? (
                          nextDueTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => {
                                setSelectedTaskId(task.id);
                                setShowTaskModal(true);
                              }}
                              className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-left transition hover:bg-[var(--surface-2)]"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{task.title}</div>
                                <div className="mt-1 text-xs text-[var(--muted)]">
                                  {deptLabel(task.department, departmentMeta)}
                                  {task.assignee ? ` • ${task.assignee.name}` : ""}
                                </div>
                              </div>
                              <div className="shrink-0 text-sm font-semibold">{formatDateOnly(task.dueAt!)}</div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--muted)]">
                            Nenhuma tarefa com prazo definido.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] p-5">
                      <div className="grid gap-4">
                        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Status</div>
                          <div className="mt-1 text-base font-semibold">Distribuição operacional</div>
                          <div className="mt-4 flex flex-col items-center gap-4">
                            <div
                              className="relative h-36 w-36 shrink-0 rounded-full"
                              style={{ background: statusDonut }}
                            >
                              <div className="absolute inset-[18%] rounded-full bg-[var(--surface-1)]" />
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Fila</div>
                                <div className="mt-1 text-2xl font-semibold">{taskStats.total}</div>
                              </div>
                            </div>
                            <div className="grid w-full gap-2 sm:grid-cols-2">
                              {overviewStatusStats.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor:
                                          statusMeta.find((statusItem) => statusItem.id === item.id)?.color ??
                                          (
                                            {
                                              to_do: "#94a3b8",
                                              in_progress: "#3b82f6",
                                              blocked: "#f97316",
                                              done: "#22c55e",
                                            } as Record<string, string>
                                          )[item.id] ??
                                          "#64748b",
                                      }}
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </span>
                                  <span className="font-semibold">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Prioridade</div>
                          <div className="mt-1 text-base font-semibold">Distribuição de prioridade</div>
                          <div className="mt-4 flex flex-col items-center gap-4">
                            <div
                              className="relative h-36 w-36 shrink-0 rounded-full"
                              style={{ background: priorityDonut }}
                            >
                              <div className="absolute inset-[18%] rounded-full bg-[var(--surface-1)]" />
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Urgência</div>
                                <div className="mt-1 text-2xl font-semibold">{overviewPriorityStats[0]?.value ?? 0}</div>
                              </div>
                            </div>
                            <div className="grid w-full gap-2 sm:grid-cols-2">
                              {overviewPriorityStats.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
                                >
                                  <span className="truncate">{item.label}</span>
                                  <span className="font-semibold">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] p-5">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Projeção</div>
                      <div className="mt-1 text-base font-semibold">Projeção operacional</div>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Fechamento estimado</div>
                              <div className="mt-1 text-3xl font-semibold">{weekProjectionPct}%</div>
                            </div>
                            <div className="text-right text-xs text-[var(--muted)]">
                              estimado pela mistura de
                              <br />
                              conclusão, atraso e atribuição
                            </div>
                          </div>
                          <div className="mt-4 h-3 rounded-full bg-[var(--surface-1)]">
                            <div className="h-3 rounded-full bg-[var(--primary)]" style={{ width: `${weekProjectionPct}%` }} />
                          </div>
                        </div>
                        {[
                          { label: "Concluídas", value: completionPct },
                          { label: "Atribuídas", value: assignmentPct },
                          { label: "Risco de atraso", value: overdueRiskPct },
                        ].map((item) => (
                          <div key={item.label} className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">{item.label}</span>
                              <span className="text-sm font-semibold">{item.value}%</span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-[var(--surface-2)]">
                              <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${item.value}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)] p-5">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Responsáveis</div>
                      <div className="mt-1 text-base font-semibold">Distribuição por agente</div>
                      <div className="mt-4 space-y-3">
                        {overviewAssigneeStats.map((item) => (
                          <div key={item.id} className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">{item.label}</span>
                              <span className="text-sm font-semibold">{item.value}</span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-[var(--surface-2)]">
                              <div
                                className="h-2 rounded-full bg-[var(--primary)]"
                                style={{ width: `${(item.value / assigneeMax) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : viewType === "board" ? (
              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-max items-start gap-4">
                  {(statusMeta.length ? statusMeta.map((x) => x.id) : (["to_do", "in_progress", "blocked", "done"] as TaskStatus[])).map((s) => {
                    const columnTasks = visibleTasks.filter((t) => t.status === s).slice(0, 200);
                    const statusColor = statusMeta.find((x) => x.id === s)?.color ?? "#64748b";
                    return (
                      <div
                        key={s}
                        className={[
                          "flex h-[calc(100vh-19rem)] min-h-[420px] w-[320px] min-w-[320px] flex-col overflow-hidden rounded-[30px] border p-3 transition",
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
                        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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

            {department === "all" ? (
              <button
                type="button"
                onClick={openAccessibilityPreferences}
                className="fixed bottom-14 left-3 z-40 inline-flex h-10 items-center rounded-2xl border border-[var(--border)] bg-[var(--card)]/92 px-3 text-xs font-medium backdrop-blur hover:bg-[color-mix(in_srgb,var(--card)_96%,white)]"
                title="Acessibilidade"
              >
                A11y
              </button>
            ) : null}

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
                    <ChoiceSelect
                      value={newDepartment}
                      onChange={(v) => setNewDepartment(v as Department)}
                      options={createTaskDepartmentOptions}
                      placeholder="Selecione o departamento"
                      title="Departamento"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <ChoiceSelect
                          value={newTaskTypeId}
                          onChange={setNewTaskTypeId}
                          options={createTaskTypeOptions}
                          placeholder="Tipo de tarefa"
                          title="Tipo de tarefa"
                        />
                      </div>
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
                      <ChoiceSelect
                        value={newAssignee}
                        onChange={(v) => setNewAssignee(v as typeof newAssignee)}
                        options={createTaskAssigneeOptions}
                        placeholder="Responsável"
                        title="Responsável"
                      />
                      {me?.agentId === "gustavo" ? (
                        <div className="col-span-full text-xs text-[var(--muted)]">
                          As tarefas criadas por Gustavo ficam atribuídas ao próprio Gustavo.
                        </div>
                      ) : null}
                      <ChoiceSelect
                        value={newPriority}
                        onChange={(v) => setNewPriority(v as TaskPriority)}
                        options={createTaskPriorityOptions}
                        placeholder="Prioridade"
                        title="Prioridade"
                      />
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
                className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6 bg-black/55 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowTaskModal(false);
                }}
              >
                <div className="my-4 w-full max-w-[92vw] xl:max-w-[1500px] max-h-none overflow-visible rounded-[36px] bg-[color-mix(in_srgb,var(--background)_95%,black)] ring-1 ring-white/10 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Editar tarefa</div>
                    <div className="flex items-center gap-2">
                      {details ? (
                        <button
                          type="button"
                          disabled={deletingTask}
                          onClick={() => {
                            if (!details) return;
                            const confirmed = window.confirm(
                              `Excluir a tarefa "${details.title}"? Esta ação também remove comentários, anexos, auditoria e subtarefas.`,
                            );
                            if (!confirmed) return;
                            void deleteTask(details.id);
                          }}
                          className="rounded-xl px-3 py-2 text-xs bg-[color-mix(in_srgb,#dc2626_18%,transparent)] text-[#fecaca] ring-1 ring-[color-mix(in_srgb,#dc2626_35%,transparent)] hover:bg-[color-mix(in_srgb,#dc2626_24%,transparent)] disabled:opacity-60"
                        >
                          {deletingTask ? "Excluindo..." : "Excluir tarefa"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowTaskModal(false)}
                        className="rounded-xl px-3 py-2 text-xs bg-white/5 ring-1 ring-white/10 hover:bg-white/8"
                      >
                        Fechar
                      </button>
                    </div>
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
          </div>
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
