import {
	DatabaseSync,
	type SQLInputValue,
	type StatementSync,
} from "node:sqlite";

type BoundStatement = {
	execute(): D1Result<unknown>;
};

function resultFromStatement(
	statement: StatementSync,
	params: unknown[],
): D1Result<unknown> {
	const sqlParams = params as SQLInputValue[];
	if (statement.columns().length > 0) {
		const results = statement.all(...sqlParams) as Record<string, unknown>[];
		return {
			success: true,
			results,
			meta: {} as D1Meta & Record<string, unknown>,
		};
	}
	const result = statement.run(...sqlParams);
	return {
		success: true,
		results: [],
		meta: { changes: result.changes } as D1Meta & Record<string, unknown>,
	};
}

/**
 * Test-only D1 adapter backed by Node's in-memory SQLite. Batch calls use one
 * transaction so rollback behavior matches D1's atomic `db.batch()` contract.
 */
export function createSqliteD1() {
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec("pragma foreign_keys = off");

	const database = {
		prepare(query: string) {
			const makeBound = (params: unknown[]): D1PreparedStatement => {
				const statement = sqlite.prepare(query);
				const execute = () => resultFromStatement(statement, params);
				return {
					bind: (...nextParams: unknown[]) => makeBound(nextParams),
					async first(column?: string) {
						const row = statement.get(...(params as SQLInputValue[])) as
							| Record<string, unknown>
							| undefined;
						if (!row) return null;
						return column ? (row[column] ?? null) : row;
					},
					async run() {
						return execute();
					},
					async all() {
						return execute();
					},
					async raw() {
						const names = statement.columns().map((column) => column.name);
						const lastIndex = new Map<string, number>();
						for (const [index, name] of names.entries())
							lastIndex.set(name, index);
						const rows = statement.all(
							...(params as SQLInputValue[]),
						) as Record<string, unknown>[];
						return rows.map((row) =>
							names.map((name, index) => {
								if (lastIndex.get(name) !== index) return null;
								const value = row[name];
								return value === undefined ? null : value;
							}),
						);
					},
					execute,
				} as D1PreparedStatement & BoundStatement;
			};
			return makeBound([]);
		},
		async batch(statements: D1PreparedStatement[]) {
			sqlite.exec("begin");
			try {
				const results = statements.map((statement) =>
					(statement as D1PreparedStatement & BoundStatement).execute(),
				);
				sqlite.exec("commit");
				return results;
			} catch (error) {
				sqlite.exec("rollback");
				throw error;
			}
		},
		async exec(query: string) {
			sqlite.exec(query);
			return { count: 0, duration: 0 };
		},
	} as unknown as D1Database;

	return { database, sqlite };
}
