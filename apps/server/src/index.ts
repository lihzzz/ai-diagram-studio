import { prisma } from "./db.js";
import { createApp } from "./app.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  const app = await createApp();

  const close = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void close();
  });
  process.on("SIGTERM", () => {
    void close();
  });

  await app.listen({
    port: config.port,
    host: "0.0.0.0"
  });
}

void main();
