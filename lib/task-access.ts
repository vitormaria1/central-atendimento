import { dbQuery } from "@/lib/db";

type Session = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

export async function canAccessTask(session: Session, taskId: number) {
  if (session.agentId === "vanderlei") return true;
  const { rows } = await dbQuery<{ ok: boolean }>(
    "select true as ok from tasks where id = $1 and assignee_agent_id = $2 limit 1",
    [taskId, session.agentId],
  );
  return Boolean(rows[0]?.ok);
}

export async function requireTaskAccess(session: Session, taskId: number) {
  const ok = await canAccessTask(session, taskId);
  if (!ok) return false;
  return true;
}

