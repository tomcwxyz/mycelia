import { z } from "zod/v3";

export const changeEmailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const suspendUserSchema = z.object({
  suspend: z.boolean(),
});

export const deleteUserSchema = z.object({
  confirmEmail: z.string().email(),
});

export const grantSubscriptionSchema = z.object({
  grant: z.boolean(),
});
