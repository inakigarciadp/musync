import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { AuthService } from "../../../services/auth";

export const logoutCommand = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const tokens = yield* auth.loadTokens;

    if (tokens === null) {
      yield* Console.log("Already logged out.");
    } else {
      yield* Console.log("Logging out...");
      yield* auth.clearTokens;
      yield* Console.log("Successfully logged out. Tokens removed.");
    }
  }),
).pipe(Command.withDescription("Remove stored authentication tokens"));
