/**
 * Load one wrangler --dry-run bundle in Miniflare and serve a single request.
 * A startup exception (the Workers Builds upload check) fails the process.
 * Any HTTP response means the isolate started.
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

function readCompat(filePath) {
	const text = fs.readFileSync(filePath, "utf8");
	const dateMatch = text.match(/"compatibility_date"\s*:\s*"([^"]+)"/);
	if (!dateMatch) {
		throw new Error(`no compatibility_date in ${filePath}`);
	}
	const flags = [];
	const block = text.match(/"compatibility_flags"\s*:\s*\[([\s\S]*?)\]/);
	if (block) {
		for (const match of block[1].matchAll(/"([^"]+)"/g)) {
			flags.push(match[1]);
		}
	}
	return {
		compatibilityDate: dateMatch[1],
		compatibilityFlags: flags,
	};
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
const compat = readCompat(configPath);

const miniflare = new Miniflare({
	workers: [
		{
			config: {
				name,
				compatibilityDate: compat.compatibilityDate,
				compatibilityFlags: compat.compatibilityFlags,
				manifest: {
					mainModule,
					modules,
				},
			},
		},
	],
});

try {
	const response = await miniflare.dispatchFetch(requestUrl);
	const body = await response.text();
	console.log(
		`${name}: startup ok status=${response.status} main=${mainModule} body=${JSON.stringify(body.slice(0, 120))}`,
	);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`${name}: startup failed`);
	console.error(message);
	process.exitCode = 1;
} finally {
	await miniflare.dispose();
}
