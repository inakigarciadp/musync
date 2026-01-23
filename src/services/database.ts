import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Cause, Context, Effect, Exit, Option, Runtime } from "effect";
import { DatabaseError } from "../domain/errors/database";
import * as schema from "../infrastructure/db/schema";
import { getAppDataDir } from "../infrastructure/paths/xdg";

const getDb = Effect.gen(function* () {
  const appDataDir = yield* getAppDataDir();
  const dbPath = `${appDataDir}/musync.db`;
  const client = createClient({ url: `file:${dbPath}` });
  return drizzle(client, { schema });
});

// Transaction context type
type TransactionContextShape = <U>(
  fn: (client: Effect.Effect.Success<typeof getDb>) => Promise<U>,
) => Effect.Effect<U, DatabaseError>;

const TransactionContext =
  Context.GenericTag<TransactionContextShape>("TransactionContext");

export class DatabaseService extends Effect.Service<DatabaseService>()(
  "database",
  {
    effect: Effect.gen(function* () {
      yield* Effect.log("Initializing Database Service");

      const db = yield* getDb;

      // yield* Effect.log("Running migrations ...");
      // yield* Effect.tryPromise({
      //   try: async () => {
      //     await migrate(db, { migrationsFolder: "./drizzle" });
      //   },
      //   catch: (cause) =>
      //     new DatabaseError({ reason: "Failed to run migrations", cause }),
      // });

      yield* Effect.log("Setting PRAGMAs ...");
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            db.run(`PRAGMA foreign_keys = ON;`),
            db.run(`PRAGMA journal_mode = WAL;`),
            db.run(`PRAGMA synchronous = NORMAL;`),
            db.run(`PRAGMA cache_size = 10000;`),
            db.run(`PRAGMA temp_store = memory;`),
            db.run(`PRAGMA mmap_size = 268435456;`),
          ]),
        catch: (cause) =>
          new DatabaseError({ reason: "Failed to set PRAGMA", cause }),
      });

      // Execute function - wraps regular db calls
      const execute = <T>(fn: (client: typeof db) => Promise<T>) =>
        Effect.tryPromise({
          try: () => fn(db),
          catch: (cause) => {
            throw new DatabaseError({ reason: "Query failed", cause });
          },
        });

      // runQuery - automatically detects if in transaction or not
      const runQuery = <T>(fn: (client: typeof db) => Promise<T>) =>
        Effect.serviceOption(TransactionContext).pipe(
          Effect.map(Option.getOrNull),
          Effect.flatMap((txOrNull) => (txOrNull ? txOrNull(fn) : execute(fn))),
        );

      const transaction = <T, E, R>(
        effect: Effect.Effect<T, E, R | TransactionContextShape>,
      ) =>
        Effect.runtime<R>().pipe(
          // Capture the runtime with all services
          Effect.map((runtime) => Runtime.runPromiseExit(runtime)),

          // Use the captured runtime to run effects inside the transaction
          Effect.flatMap((runPromiseExit) =>
            Effect.async<T, DatabaseError | E, R>((resume) => {
              db.transaction(async (tx) => {
                // Wrapper that uses the transaction client
                const txWrapper = <U>(fn: (client: typeof db) => Promise<U>) =>
                  Effect.tryPromise({
                    try: () => fn(tx as unknown as typeof db),
                    catch: (cause) => {
                      throw new DatabaseError({
                        reason: "Transaction query failed",
                        cause,
                      });
                    },
                  });

                // Provide the transaction context to the effect
                const effectWithTx = effect.pipe(
                  Effect.provideService(TransactionContext, txWrapper),
                );

                // Run the effect with the captured runtime
                const result = await runPromiseExit(
                  effectWithTx.pipe(
                    Effect.tap(() =>
                      Effect.succeed("Transaction effect succeeded"),
                    ),
                    Effect.tapError((error) =>
                      Effect.logError(
                        `Transaction effect failed, rollback: ${error}`,
                      ),
                    ),
                  ),
                );

                // Handle the result
                Exit.match(result, {
                  onSuccess: (value) => {
                    resume(Effect.succeed(value));
                  },
                  onFailure: (cause) => {
                    tx.rollback();
                    if (Cause.isFailure(cause)) {
                      resume(Effect.fail(Cause.originalError(cause) as E));
                    } else {
                      resume(Effect.die(cause));
                    }
                  },
                });
              }).catch((cause) => {
                resume(
                  Effect.fail(
                    new DatabaseError({
                      reason: "Transaction failed",
                      cause,
                    }),
                  ),
                );
              });
            }),
          ),
        );

      return {
        db,
        transaction,
        schema,
        runQuery,
      };
    }),
  },
) {}
