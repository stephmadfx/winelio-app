import { supabaseAdmin } from "@/lib/supabase/admin";
import { BugTrackerBoard, type BugBoardReport } from "@/components/admin/BugTrackerBoard";

function normalizeReporter(reporter: unknown) {
  if (Array.isArray(reporter)) return reporter[0] ?? null;
  return reporter ?? null;
}

export default async function BugsPage() {
  const { data: bugReports } = await supabaseAdmin
    .from("bug_reports")
    .select(
      `
        id,
        user_id,
        message,
        page_url,
        status,
        admin_reply,
        reply_images,
        created_at,
        replied_at,
        tracking_status,
        ticket_type,
        priority,
        internal_note,
        updated_at,
        screenshot_url,
        source
      `
    )
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const userIds = [...new Set((bugReports ?? []).map((report) => report.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> };

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const reports: BugBoardReport[] = await Promise.all(
    (bugReports ?? []).map(async (report) => {
      let screenshotSignedUrl: string | null = null;

      if (report.screenshot_url) {
        const { data } = await supabaseAdmin.storage
          .from("bug-screenshots")
          .createSignedUrl(report.screenshot_url, 60 * 60 * 24 * 7);
        screenshotSignedUrl = data?.signedUrl ?? null;
      }

      return {
        ...report,
        reporter: normalizeReporter(profileMap.get(report.user_id) ?? null),
        screenshot_signed_url: screenshotSignedUrl,
      } as BugBoardReport;
    })
  );

  const statusCounts = reports.reduce<Record<string, number>>((acc, report) => {
    acc[report.tracking_status] = (acc[report.tracking_status] ?? 0) + 1;
    return acc;
  }, {});

  const totalOpen = reports.filter((report) => report.tracking_status !== "done").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-winelio-orange">
            Super Admin
          </p>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            Bugs & idées
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Vue interne pour suivre les bugs, les suggestions de correction et les
            modifications à planifier. Chaque carte peut être qualifiée, enrichie
            et déplacée comme dans un tableau de type Trello.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[420px]">
          {[
            { label: "À faire", value: statusCounts.todo ?? 0 },
            { label: "En cours", value: statusCounts.in_progress ?? 0 },
            { label: "Bloqué", value: statusCounts.blocked ?? 0 },
            { label: "Terminé", value: statusCounts.done ?? 0 },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Tableau de suivi</h2>
            <p className="text-sm text-muted-foreground">
              {reports.length} ticket(s) au total, {totalOpen} encore ouverts.
            </p>
          </div>
        </div>

        <BugTrackerBoard reports={reports} />
      </div>
    </div>
  );
}
