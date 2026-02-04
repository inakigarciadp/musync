import { Command, Prompt } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { CloudflareCredentials } from "../../../domain/models/cloudflare";
import { CloudflareCredentialsService } from "../../../services/cloudflare-credentials";

export const cloudflareSetCommand = Command.make(
  "set",
  {},
  Effect.fnUntraced(function* () {
    const cfCredentials = yield* CloudflareCredentialsService;

    // Load existing credentials to allow keeping previous User-Agent
    const existingCredentials = yield* cfCredentials.loadCredentials();
    const hasPreviousUserAgent =
      existingCredentials !== null && existingCredentials.userAgent.length > 0;

    yield* Console.log("Cloudflare credentials setup");
    yield* Console.log("");
    yield* Console.log(
      "To get these values, open lucida.to in your browser and complete the challenge.",
    );
    yield* Console.log("Then open DevTools (F12) and:");
    yield* Console.log("");
    yield* Console.log("For cf_clearance cookie:");
    yield* Console.log(
      "  Application tab -> Cookies -> lucida.to -> cf_clearance",
    );
    yield* Console.log("");
    yield* Console.log("For User-Agent:");
    yield* Console.log("  Console tab -> type: navigator.userAgent");
    yield* Console.log("");

    const cfClearance = yield* Prompt.text({
      message: "Paste the cf_clearance cookie value:",
      validate: (value) =>
        value.trim().length > 0
          ? Effect.succeed(value.trim())
          : Effect.fail("Cookie value cannot be empty"),
    });

    const userAgentPromptMessage = hasPreviousUserAgent
      ? "Paste your User-Agent string (leave empty to keep previous):"
      : "Paste your User-Agent string:";

    const userAgentInput = yield* Prompt.text({
      message: userAgentPromptMessage,
      validate: (value) => {
        const trimmed = value.trim();
        // Allow empty only if we have a previous value to fall back to
        if (trimmed.length === 0 && !hasPreviousUserAgent) {
          return Effect.fail("User-Agent cannot be empty");
        }
        return Effect.succeed(trimmed);
      },
    });

    // Determine final User-Agent: use input if provided, otherwise keep previous
    const userAgentOption =
      userAgentInput.length > 0
        ? Option.some(userAgentInput)
        : Option.fromNullable(existingCredentials?.userAgent);

    const userAgent = Option.getOrThrow(userAgentOption);
    const keptPreviousUserAgent = userAgentInput.length === 0;

    const credentials = new CloudflareCredentials({
      cfClearance,
      userAgent,
    });

    yield* cfCredentials.storeCredentials(credentials);

    yield* Console.log("");
    yield* Console.log("Cloudflare credentials saved successfully!");
    if (keptPreviousUserAgent) {
      yield* Console.log("User-Agent kept as previous value.");
    }
    yield* Console.log("You can now re-run your command.");
  }),
).pipe(
  Command.withDescription(
    "Store Cloudflare bypass credentials (cf_clearance cookie and User-Agent)",
  ),
);
