// GitTalks - Better Auth Client
// Client-side auth actions for React components

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

// Export typed session hook and sign-in helpers
export const { signIn, signOut, useSession } = authClient;
