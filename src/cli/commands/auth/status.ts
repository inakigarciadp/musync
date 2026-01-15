import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { AuthService } from "../../../services/auth";

export const authStatusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const tokens = yield* auth.loadTokens;

    if (tokens === null) {
      yield* Console.log("✗ Not authenticated");
      yield* Console.log(
        "Run 'musync auth login' to authenticate with YouTube",
      );
    } else {
      const now = new Date();
      const timeUntilExpiry = tokens.expiresAt.getTime() - now.getTime();
      const isExpired = timeUntilExpiry <= 0;

      yield* Console.log("✓ Authenticated");
      yield* Console.log(
        `Access token expires: ${tokens.expiresAt.toLocaleString()}`,
      );

      if (isExpired) {
        yield* Console.log("⚠ Token is expired - you may need to log in again");
      } else {
        const hours = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
        const minutes = Math.floor(
          (timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60),
        );
        yield* Console.log(`  (in ${hours} hours, ${minutes} minutes)`);
      }
    }
  }),
).pipe(Command.withDescription("Show auth state"));
