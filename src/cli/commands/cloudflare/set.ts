import { Command, Prompt } from "@effect/cli";
import { Console, Effect } from "effect";
import { CloudflareCredentials } from "../../../domain/models/cloudflare";
import { CloudflareCredentialsService } from "../../../services/cloudflare-credentials";

export const cloudflareSetCommand = Command.make(
  "set",
  {},
  Effect.fnUntraced(function* () {
    const cfCredentials = yield* CloudflareCredentialsService;

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

    const userAgent = yield* Prompt.text({
      message: "Paste your User-Agent string:",
      validate: (value) =>
        value.trim().length > 0
          ? Effect.succeed(value.trim())
          : Effect.fail("User-Agent cannot be empty"),
    });

    const credentials = new CloudflareCredentials({
      cfClearance,
      userAgent,
    });

    yield* cfCredentials.storeCredentials(credentials);

    yield* Console.log("");
    yield* Console.log("Cloudflare credentials saved successfully!");
    yield* Console.log("You can now re-run your command.");
  }),
).pipe(
  Command.withDescription(
    "Store Cloudflare bypass credentials (cf_clearance cookie and User-Agent)",
  ),
);
