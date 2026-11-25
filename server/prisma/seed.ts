import { PrismaClient, type Priority, type Status } from "@prisma/client";

const prisma = new PrismaClient();

const GAP = 1000;

const seed: Array<{
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: Status;
}> = [
  { title: "Set up CI pipeline", description: "GitHub Actions for lint, typecheck and tests.", priority: "medium", assignee: "Alice", status: "backlog" },
  { title: "Write onboarding docs", description: "Document local setup for new contributors.", priority: "low", assignee: "Bob", status: "backlog" },
  { title: "Dark mode", description: "Support system color scheme.", priority: "low", assignee: "", status: "backlog" },
  { title: "Design login page", description: "Email + password, forgot password link.", priority: "high", assignee: "Carol", status: "todo" },
  { title: "Add rate limiting", description: "Protect write endpoints.", priority: "medium", assignee: "Alice", status: "todo" },
  { title: "Kanban drag and drop", description: "Move tasks between columns and reorder within a column.", priority: "high", assignee: "Bob", status: "in_progress" },
  { title: "Real-time updates via SSE", description: "Stream create/update/delete events to all clients.", priority: "high", assignee: "Carol", status: "in_progress" },
  { title: "Project scaffolding", description: "Monorepo with client and server.", priority: "medium", assignee: "Alice", status: "done" },
  { title: "Database schema", description: "Tasks table with fractional positions.", priority: "medium", assignee: "Bob", status: "done" },
];

async function main() {
  await prisma.task.deleteMany();
  const counters: Record<string, number> = {};
  for (const t of seed) {
    counters[t.status] = (counters[t.status] ?? 0) + 1;
    await prisma.task.create({ data: { ...t, position: counters[t.status] * GAP } });
  }
  console.log(`Seeded ${seed.length} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
