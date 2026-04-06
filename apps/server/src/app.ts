import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";

import { config } from "./config.js";
import { registerRoutes } from "./api/routes.js";
import { HttpError } from "./utils/http-error.js";

export async function createApp() {
  const app = Fastify({ logger: config.nodeEnv !== "test" });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: config.docMaxFileMb * 1024 * 1024
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 400,
        message: "invalid request",
        details: error.flatten()
      });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        code: error.statusCode,
        message: error.message
      });
    }

    app.log.error(error);
    const isDev = config.nodeEnv === "development";
    const detail = error instanceof Error ? error.message : "unknown error";
    return reply.status(500).send({
      code: 500,
      message: isDev ? detail : "internal server error"
    });
  });

  await registerRoutes(app);

  return app;
}
