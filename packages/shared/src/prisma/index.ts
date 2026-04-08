import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __horiPrisma__: PrismaClient | undefined;
}

export function createPrismaClient() {
  if (!global.__horiPrisma__) {
    global.__horiPrisma__ = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }

  return global.__horiPrisma__;
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

