export function data<T>(body: T, init?: number | ResponseInit) {
	if (typeof init === "number") {
		return Response.json(body, { status: init });
	}
	return Response.json(body, init);
}
