import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Cause, Context, Effect, Exit, Option, Runtime } from "effect";
import { DatabaseError } from "../domain/errors/database";
import * as schema from "../infrastructure/db/schema";
import { PathsService } from "./paths";

// Helper to infer db type
type DbType = ReturnType<typeof drizzle<typeof schema>>;

// Transaction context type
type TransactionContextShape = <U>(
  fn: (client: DbType) => Promise<U>,
) => Effect.Effect<U, DatabaseError>;

const TransactionContext =
  Context.GenericTag<TransactionContextShape>("TransactionContext");

// @effect-diagnostics-next-line unsupportedServiceAccessors:off
export class DatabaseService extends Effect.Service<DatabaseService>()(
  "DatabaseService",
  {
    accessors: true,
    dependencies: [PathsService.Default],
    effect: Effect.gen(function* () {
      yield* Effect.log("Initializing Database Service");

      const paths = yield* PathsService;

      const getDb = Effect.fn("DatabaseService.getDb")(function* () {
        const appDataDir = yield* paths.getAppDataDir();
        const dbPath = `${appDataDir}/musync.db`;
        const client = createClient({ url: `file:${dbPath}` });
        return drizzle(client, { schema });
      });

      const db = yield* getDb();

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
          DatabaseError.make({ message: "Failed to set PRAGMA", cause }),
      });

      // Execute function - wraps regular db calls
      const execute = Effect.fn("DatabaseService.execute")(
        <T>(fn: (client: DbType) => Promise<T>) =>
          Effect.tryPromise({
            try: () => fn(db),
            catch: (cause) => {
              return DatabaseError.make({ message: "Query failed", cause });
            },
          }),
      );

      // runQuery - automatically detects if in transaction or not
      const runQuery = Effect.fn("DatabaseService.runQuery")(
        <T>(fn: (client: DbType) => Promise<T>) =>
          Effect.serviceOption(TransactionContext).pipe(
            Effect.map(Option.getOrNull),
            Effect.flatMap((txOrNull) =>
              txOrNull ? txOrNull(fn) : execute(fn),
            ),
          ),
      );

      const transaction = Effect.fn("DatabaseService.transaction")(
        <T, E, R>(effect: Effect.Effect<T, E, R | TransactionContextShape>) =>
          Effect.runtime<R>().pipe(
            // Capture the runtime with all services
            Effect.map((runtime) => Runtime.runPromiseExit(runtime)),

            // Use the captured runtime to run effects inside the transaction
            Effect.flatMap((runPromiseExit) =>
              Effect.async<T, DatabaseError | E, R>((resume) => {
                db.transaction(async (tx) => {
                  // Wrapper that uses the transaction client
                  const txWrapper = <U>(fn: (client: DbType) => Promise<U>) =>
                    Effect.tryPromise({
                      try: () => fn(tx as unknown as DbType),
                      catch: (cause) => {
                        return DatabaseError.make({
                          message: "Transaction query failed",
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
                      DatabaseError.make({
                        message: "Transaction failed",
                        cause,
                      }),
                    ),
                  );
                });
              }),
            ),
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
