import { Console, type Effect } from "effect";

export const formatJson = <T>(data: T): Effect.Effect<void> =>
  Console.log(JSON.stringify(data, null, 2));
