import { createMiddleware } from "hono/factory";

type Bindings = {
  API_KEY: string;
};

export const apiKeyAuth = createMiddleware<{
  Bindings: Bindings;
}>(async (c, next) => {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    return c.json(
      {
        error: "Missing API key",
      },
      401
    );
  }

  if (apiKey !== c.env.API_KEY) {
    return c.json(
      {
        error: "Invalid API key",
      },
      401
    );
  }

  await next();
});