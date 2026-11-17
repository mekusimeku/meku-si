import { LabSession } from "./lab-session.ts";

let session: LabSession | null = null;

export function labRuntime(): LabSession {
  if (!session) session = LabSession.open();
  return session;
}

export function resetLabRuntime(): LabSession {
  session = LabSession.open();
  return session;
}
