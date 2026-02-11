import { HttpClient } from "@effect/platform";
import { Effect, Ref } from "effect";
import { createDownload } from "./download";
import { createSearch } from "./search";

const MIN_REQUEST_INTERVAL = 2000; // 2 seconds

export class LucidaService extends Effect.Service<LucidaService>()(
  "LucidaService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

      // Thread-safe state for rate limiting (last request timestamp)
      const lastRequestTime = yield* Ref.make(0);

      const deps = {
        http,
        lastRequestTime,
        minRequestInterval: MIN_REQUEST_INTERVAL,
      };

      const search = createSearch(deps);
      const download = createDownload(deps);

      return { search, download };
    }),
  },
) {}
