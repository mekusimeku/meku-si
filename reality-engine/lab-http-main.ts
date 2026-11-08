import { LabSession } from "./lab-session.ts";
import { startLabServer } from "./lab-http.ts";

if (process.env.MEKU_PRODUCTION_PAYMENTS === "1") {
  console.error("Refusing to start the test lab while production payments are enabled.");
  process.exit(1);
}
const port = Number(process.env.LAB_PORT);
const dbPath = process.env.LAB_DB;
if (!Number.isInteger(port) || port < 1 || !dbPath) {
  console.error("LAB_PORT and LAB_DB are required");
  process.exit(1);
}

const session = LabSession.open({ dbPath, start: 1_762_560_000_000 });
const server = await startLabServer(port, session);
console.log(`listening ${port}`);
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
