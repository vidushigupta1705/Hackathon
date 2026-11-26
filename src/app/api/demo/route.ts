import { NextResponse } from "next/server";
import { ensureDemo, removeDemoData, resetDemoData, deleteSetting } from "@/lib/store";

export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (action === "remove") await removeDemoData();
    else if (action === "reset") await resetDemoData();
    else {
      await deleteSetting("demo_disabled");
      await ensureDemo();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
