// zod >=4.4.1 marks its subpath barrels side-effect-free. When esbuild wraps
// zod in lazy __esm inits (dynamic imports cause that), it drops the zod/v4
// barrel, so the MCP SDK's types.js calls z.custom() before zod initializes
// ("Class2 is not a constructor", Workers error 10021).
// A Worker entry must import this module first, and ZodType must be read here.
// The read is what makes esbuild emit zod's init call. A bare `import "zod"`
// or an unused import does not.
import { ZodType } from "zod";

if (typeof ZodType !== "function") {
	throw new Error("zod did not initialize");
}
