/**
 * Download a pinned Node.js linux-x64 build for the merge-request gate.
 * Wrangler and Miniflare need Node. The oven/bun image does not ship it,
 * and that image has no curl. Bun fetches the tarball and checks sha256.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const version = "v22.23.5";
const sha256 =
	"c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1";
const name = `node-${version}-linux-x64.tar.gz`;

const response = await fetch(`https://nodejs.org/dist/${version}/${name}`);
if (!response.ok) {
	throw new Error(`node download ${response.status}`);
}
const bytes = new Uint8Array(await response.arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== sha256) {
	throw new Error(`node checksum ${got}`);
}
writeFileSync(name, bytes);
