import { z } from "zod";

/** Schema for queue job request IDs (UUIDs). */
export const RequestIdSchema = z.string().uuid();
