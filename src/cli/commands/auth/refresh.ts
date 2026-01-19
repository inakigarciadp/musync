import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { AuthService } from "../../../services/auth";

export const authRefreshCommand = Command.make(
  "refresh",
  {},
  Effect.fnUntraced(function* () {
    const auth = yield* AuthService;
    const tokens = yield* auth.refreshTokens();
    yield* Console.log("Token refreshed successfully");
    yield* Console.log(
      `New token expires at: ${tokens.expiresAt.toLocaleString()}`,
    );
  }),
).pipe(Command.withDescription("Manually refresh access token"));
