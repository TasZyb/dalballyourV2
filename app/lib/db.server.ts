import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) return undefined;

  try {
    const url = new URL(databaseUrl);

    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }

    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}

export const prisma =
  global.__prisma ??
  (() => {
    const databaseUrl = getDatabaseUrl();

    return new PrismaClient({
      ...(databaseUrl
        ? {
            datasources: {
              db: {
                url: databaseUrl,
              },
            },
          }
        : {}),
      log: ["error", "warn"],
    });
  })();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
