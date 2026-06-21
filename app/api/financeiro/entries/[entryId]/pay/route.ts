import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withApi(async (_req: Request, ctx: RouteContext<"/api/financeiro/entries/[entryId]/pay">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entryId } = await ctx.params;
  const { rows } = await dbQuery<{ id: string }>(
    `
      update financial_entries
      set status = 'paid', paid_at = now()
      where id = $1::bigint
      returning id::text
    `,
    [entryId],
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await dbQuery(
    `
      update billing_cycle_items
      set payment_status = 'paid', paid_at = now()
      where id = (select billing_cycle_item_id from financial_entries where id = $1::bigint)
    `,
    [entryId],
  );

  return NextResponse.json({ id: row.id });
});
