
import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

await applyD1Migrations(
  env.image_db,
  env.TEST_MIGRATIONS
);