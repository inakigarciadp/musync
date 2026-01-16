import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { AuthService } from "../../../services/auth";

export const authStatusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const tokens = yield* auth.loadTokens();

    if (tokens === null) {
      yield* Console.log("✗ Not authenticated");
      yield* Console.log(
        "Run 'musync auth login' to authenticate with YouTube",
      );
    } else {
      if (tokens.isExpired) {
        yield* Console.log("✗ Not authenticated");
        yield* Console.log(
          "Run 'musync auth login' to authenticate with YouTube",
        );
      } else {
        yield* Console.log("✓ Authenticated");
        yield* Console.log(
          `Access token expires at: ${tokens.expiresAt.toLocaleString()}`,
        );
        yield* Console.log(
          `Access token expires in: ${tokens.timeUntilExpiryString}`,
        );
      }
    }
  }),
).pipe(Command.withDescription("Show auth state"));
