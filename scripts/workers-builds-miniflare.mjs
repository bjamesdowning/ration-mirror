/**
 * Load one wrangler --dry-run bundle in Miniflare and serve a single request.
 * A startup exception fails the process. The response status must be below 500.
 */
import fs from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";

const [name, outdir, configPath, requestUrl] = process.argv.slice(2);

if (!name || !outdir || !configPath || !requestUrl) {
	console.error(
		"usage: workers-builds-miniflare.mjs <name> <outdir> <wrangler-config> <request-url>",
	);
	process.exit(1);
}

function walk(dir) {
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(fullPath));
		} else {
			files.push(fullPath);
		}
	}
	return files;
}

function stripJsonc(text) {
	let out = "";
	let inString = false;
	let quote = "";
	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		const next = text[index + 1];
		if (inString) {
			out += char;
			if (char === "\\") {
				out += next ?? "";
				index++;
				continue;
			}
			if (char === quote) inString = false;
			continue;
		}
		if (char === '"' || char === "'") {
			inString = true;
			quote = char;
			out += char;
			continue;
		}
		if (char === "/" && next === "/") {
			while (index < text.length && text[index] !== "\n") index++;
			out += "\n";
			continue;
		}
		if (char === "/" && next === "*") {
			index += 2;
			while (
				index < text.length &&
				!(text[index] === "*" && text[index + 1] === "/")
			) {
				index++;
			}
			index++;
			continue;
		}
		out += char;
	}
	return out.replace(/,\s*([}\]])/g, "$1");
}

function readConfig(filePath) {
	const config = JSON.parse(stripJsonc(fs.readFileSync(filePath, "utf8")));
	const date = config.compatibility_date;
	if (typeof date !== "string") {
		throw new Error(`no compatibility_date in ${filePath}`);
	}
	const flags = Array.isArray(config.compatibility_flags)
		? config.compatibility_flags.filter((flag) => typeof flag === "string")
		: [];
	return { config, compatibilityDate: date, compatibilityFlags: flags };
}

function bindingsFromConfig(config) {
	const bindings = {};
	const vars = config.vars ?? {};
	for (const [key, value] of Object.entries(vars)) {
		if (typeof value === "string") {
			bindings[key] = { type: "text", value };
		}
	}
	// Local stand-in so Better Auth can construct. Not a production secret.
	if (!bindings.BETTER_AUTH_SECRET) {
		bindings.BETTER_AUTH_SECRET = {
			type: "text",
			value: "local-workers-builds-gate-0123456789abcdef",
		};
	}
	for (const database of config.d1_databases ?? []) {
		bindings[database.binding] = {
			type: "d1",
			id: database.database_id ?? database.database_name,
		};
	}
	for (const namespace of config.kv_namespaces ?? []) {
		bindings[namespace.binding] = { type: "kv", id: namespace.id };
	}
	for (const bucket of config.r2_buckets ?? []) {
		bindings[bucket.binding] = { type: "r2", name: bucket.bucket_name };
	}
	return bindings;
}

async function applyMigrations(miniflare, config, configFile) {
	const configDir = path.dirname(path.resolve(configFile));
	for (const database of config.d1_databases ?? []) {
		if (!database.migrations_dir) continue;
		const migrationsDir = path.resolve(configDir, database.migrations_dir);
		const sqlFiles = fs
			.readdirSync(migrationsDir)
			.filter((fileName) => fileName.endsWith(".sql"))
			.sort();
		const d1 = await miniflare.getD1Database(database.binding, name);
		for (const fileName of sqlFiles) {
			const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
			const statements = sql
				.split(/-->\s*statement-breakpoint/g)
				.map((statement) => statement.trim())
				.filter((statement) => statement.length > 0);
			for (const statement of statements) {
				await d1.prepare(statement).run();
			}
		}
		console.log(
			`${name}: applied ${sqlFiles.length} migrations to ${database.binding}`,
		);
	}
}

const javascriptFiles = walk(outdir).filter((filePath) => {
	return filePath.endsWith(".js") || filePath.endsWith(".mjs");
});

if (javascriptFiles.length === 0) {
	console.error(`${name}: no JavaScript bundle in ${outdir}`);
	process.exit(1);
}

const preferredNames = ["index.js", "mcp.js", "copilot.js", "ration.js"];
const mainPath =
	javascriptFiles.find((filePath) =>
		preferredNames.includes(path.basename(filePath)),
	) ??
	javascriptFiles.slice().sort((left, right) => {
		return fs.statSync(right).size - fs.statSync(left).size;
	})[0];

const modules = {};
for (const filePath of javascriptFiles) {
	const relativePath = path
		.relative(outdir, filePath)
		.split(path.sep)
		.join("/");
	modules[relativePath] = {
		type: "esm",
		contents: fs.readFileSync(filePath, "utf8"),
	};
}

const mainModule = path.relative(outdir, mainPath).split(path.sep).join("/");
const { config, compatibilityDate, compatibilityFlags } =
	readConfig(configPath);

const miniflare = new Miniflare({
	workers: [
		{
			config: {
				name,
				compatibilityDate,
				compatibilityFlags,
				env: bindingsFromConfig(config),
				manifest: {
					mainModule,
					modules,
				},
			},
		},
	],
});

try {
	await applyMigrations(miniflare, config, configPath);
	const response = await miniflare.dispatchFetch(requestUrl);
	const body = await response.text();
	const detail = `status=${response.status} main=${mainModule} body=${JSON.stringify(body.slice(0, 120))}`;
	if (response.status >= 500) {
		console.error(`${name}: ${detail}`);
		console.error(`${name}: status ${response.status} is not below 500`);
		process.exitCode = 1;
	} else {
		console.log(`${name}: startup ok ${detail}`);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`${name}: startup failed`);
	console.error(message);
	process.exitCode = 1;
}

const disposeError = await miniflare.dispose().then(
	() => null,
	(error) => error,
);
if (disposeError && !process.exitCode) {
	console.error(disposeError);
	process.exitCode = 1;
}
