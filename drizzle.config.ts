import type { Config } from "drizzle-kit";
import path from "path";
import os from "os";

export default {
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${path.join(os.homedir(), ".local/share/musync/musync.db")}`,
  },
} satisfies Config;
