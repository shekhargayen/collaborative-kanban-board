import { z } from "zod";
import { PRIORITIES, STATUSES } from "./constants.js";

const title = z.string().trim().min(1, "Title is required").max(200);
const description = z.string().max(5000);
const assignee = z.string().trim().max(100);
const position = z.number().finite();

export const CreateTaskSchema = z.object({
  /** Optional client-generated UUID so optimistic creates keep a stable id. */
  id: z.string().uuid().optional(),
  title,
  description: description.default(""),
  priority: z.enum(PRIORITIES).default("medium"),
  assignee: assignee.default(""),
  status: z.enum(STATUSES).default("backlog"),
  /** Omit to append to the end of the column. */
  position: position.optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignee: assignee.optional(),
    status: z.enum(STATUSES).optional(),
    position: position.optional(),
    /** Optional optimistic-concurrency check: reject with 409 if the stored version differs. */
    version: z.number().int().positive().optional(),
  })
  .refine(
    (v) => Object.entries(v).some(([k, val]) => k !== "version" && val !== undefined),
    { message: "At least one field must be provided" },
  );
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const IdParamSchema = z.object({ id: z.string().uuid("Invalid task id") });

export const DeleteQuerySchema = z.object({
  version: z.coerce.number().int().positive().optional(),
});
