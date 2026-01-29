import { Console } from "effect";

export const formatJson = <T>(data: T) =>
  Console.log(JSON.stringify(data, null, 2));
