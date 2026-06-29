// Manually run a Chess Moves board (docs/CHESS-MOVES.md) without waiting for a tick.
// Usage (inside the agent container, where CLAUDE_CODE_OAUTH_TOKEN is set):
//   docker exec grq-agent npx tsx scripts/run-chess.ts <themeId>
//   docker exec grq-agent npx tsx scripts/run-chess.ts "uranium supply squeeze"
// A numeric arg runs an existing PENDING/READY theme; a text arg creates a BRIEF theme
// first, then maps it. Marks RUNNING → runs → save_chess_board flips it READY (or FAILED).
import { prisma } from "../lib/db";
import { runChessMoves } from "../agent/sessions";

async function main() {
  const arg = process.argv.slice(2).join(" ").trim();
  if (!arg) {
    console.error('Usage: run-chess.ts <themeId | "a theme/chain brief">');
    process.exit(1);
  }

  let id: number;
  if (/^\d+$/.test(arg)) {
    id = Number(arg);
    const t = await prisma.chessTheme.findUnique({ where: { id } });
    if (!t) {
      console.error(`No ChessTheme #${id}.`);
      process.exit(1);
    }
  } else {
    const t = await prisma.chessTheme.create({
      data: { kind: "BRIEF", title: arg.slice(0, 80), anchor: arg.slice(0, 120), brief: arg, requestedBy: "script" },
    });
    id = t.id;
    console.log(`[run-chess] created theme #${id} for brief: ${arg}`);
  }

  await prisma.chessTheme.update({ where: { id }, data: { status: "RUNNING" } });
  const theme = await prisma.chessTheme.findUniqueOrThrow({ where: { id } });
  await runChessMoves({ id: theme.id, brief: theme.brief });

  const done = await prisma.chessTheme.findUniqueOrThrow({ where: { id } });
  console.log(`[run-chess] theme #${id} → ${done.status} "${done.title}"`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[run-chess] failed:", e);
    process.exit(1);
  });
