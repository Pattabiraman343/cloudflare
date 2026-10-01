import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/auth";

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  API_KEY: string;
};

type ImageRow = {
  id: string;
  title: string;
  r2_key: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;

function getFileUrl(requestUrl: string, id: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/images/${id}/file`;
}

/**
 * Health check
 */
app.get("/", (c) => {
  return c.json({
    message: "Cloudflare Image API is running",
  });
});

/**
 * POST /images
 *
 * Upload one JPEG/PNG image and store its metadata.
 */
app.post("/images", apiKeyAuth, async (c) => {
  let body: Record<string, string | File | undefined>;

  try {
    body = await c.req.parseBody();
  } catch (error) {
    console.error("Failed to parse multipart form:", error);

    return c.json(
      {
        error: "Invalid multipart/form-data request",
      },
      400
    );
  }

  const title = body.title;
  const file = body.file;

  /**
   * Validate title
   */
  if (typeof title !== "string") {
    return c.json(
      {
        error: "Title is required",
      },
      400
    );
  }

  const trimmedTitle = title.trim();

  if (trimmedTitle.length < 1 || trimmedTitle.length > 100) {
    return c.json(
      {
        error: "Title must be between 1 and 100 characters",
      },
      400
    );
  }

  /**
   * Validate file exists
   */
  if (!(file instanceof File)) {
    return c.json(
      {
        error: "Image file is required",
      },
      400
    );
  }

  /**
   * Validate empty file
   */
  if (file.size === 0) {
    return c.json(
      {
        error: "Image file cannot be empty",
      },
      400
    );
  }

  /**
   * Validate content type
   */
  if (
    !ALLOWED_CONTENT_TYPES.includes(
      file.type as (typeof ALLOWED_CONTENT_TYPES)[number]
    )
  ) {
    return c.json(
      {
        error: "Only JPEG and PNG images are allowed",
      },
      400
    );
  }

  /**
   * Validate file size
   */
  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      {
        error: "Image size must not exceed 5 MB",
      },
      400
    );
  }

  const id = crypto.randomUUID();
  const r2Key = `images/${id}`;
  const createdAt = new Date().toISOString();

  /**
   * Upload to R2 first.
   *
   * If R2 upload fails, no D1 metadata is created.
   */
  try {
    await c.env.IMAGES.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });
  } catch (error) {
    console.error("R2 upload failed:", error);

    return c.json(
      {
        error: "Failed to upload image",
      },
      500
    );
  }

  /**
   * Save metadata in D1.
   *
   * If D1 fails after R2 upload succeeds,
   * remove the R2 object to avoid inconsistency.
   */
  try {
    await c.env.DB
      .prepare(`
        INSERT INTO images (
          id,
          title,
          r2_key,
          content_type,
          size_bytes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        trimmedTitle,
        r2Key,
        file.type,
        file.size,
        createdAt
      )
      .run();
  } catch (error) {
    console.error("D1 insert failed:", error);

    try {
      await c.env.IMAGES.delete(r2Key);
    } catch (cleanupError) {
      console.error(
        "R2 cleanup after D1 failure also failed:",
        cleanupError
      );
    }

    return c.json(
      {
        error: "Failed to save image metadata",
      },
      500
    );
  }

  return c.json(
    {
      id,
      title: trimmedTitle,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      createdAt,
      fileUrl: getFileUrl(c.req.url, id),
    },
    201
  );
});

/**
 * GET /images?page=1&limit=20
 *
 * Newest images first.
 */
app.get("/images", async (c) => {
  const pageParam = c.req.query("page") || "1";
  const limitParam = c.req.query("limit") || "20";

  const page = Number(pageParam);
  const limit = Number(limitParam);

  if (!Number.isInteger(page) || page < 1) {
    return c.json(
      {
        error: "Page must be a positive integer",
      },
      400
    );
  }

  if (!Number.isInteger(limit) || limit < 1) {
    return c.json(
      {
        error: "Limit must be a positive integer",
      },
      400
    );
  }

  if (limit > 50) {
    return c.json(
      {
        error: "Limit cannot exceed 50",
      },
      400
    );
  }

  const offset = (page - 1) * limit;

  try {
    const result = await c.env.DB
      .prepare(`
        SELECT
          id,
          title,
          r2_key,
          content_type,
          size_bytes,
          created_at
        FROM images
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(limit, offset)
      .all<ImageRow>();

    const data = result.results.map((image) => ({
      id: image.id,
      title: image.title,
      r2Key: image.r2_key,
      contentType: image.content_type,
      sizeBytes: image.size_bytes,
      createdAt: image.created_at,
      fileUrl: getFileUrl(c.req.url, image.id),
    }));

    return c.json({
      page,
      limit,
      data,
    });
  } catch (error) {
    console.error("Failed to list images:", error);

    return c.json(
      {
        error: "Failed to retrieve images",
      },
      500
    );
  }
});

/**
 * GET /images/:id
 *
 * Retrieve image metadata.
 */
app.get("/images/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const image = await c.env.DB
      .prepare(`
        SELECT
          id,
          title,
          r2_key,
          content_type,
          size_bytes,
          created_at
        FROM images
        WHERE id = ?
      `)
      .bind(id)
      .first<ImageRow>();

    if (!image) {
      return c.json(
        {
          error: "Image not found",
        },
        404
      );
    }

    return c.json({
      id: image.id,
      title: image.title,
      r2Key: image.r2_key,
      contentType: image.content_type,
      sizeBytes: image.size_bytes,
      createdAt: image.created_at,
      fileUrl: getFileUrl(c.req.url, image.id),
    });
  } catch (error) {
    console.error("Failed to retrieve image metadata:", error);

    return c.json(
      {
        error: "Failed to retrieve image metadata",
      },
      500
    );
  }
});

/**
 * GET /images/:id/file
 *
 * Retrieve the actual private R2 object through the Worker.
 */
app.get("/images/:id/file", async (c) => {
  const id = c.req.param("id");

  try {
    const image = await c.env.DB
      .prepare(`
        SELECT
          id,
          r2_key,
          content_type,
          size_bytes
        FROM images
        WHERE id = ?
      `)
      .bind(id)
      .first<{
        id: string;
        r2_key: string;
        content_type: string;
        size_bytes: number;
      }>();

    if (!image) {
      return c.json(
        {
          error: "Image not found",
        },
        404
      );
    }

    const object = await c.env.IMAGES.get(image.r2_key);

    if (!object) {
      console.error(
        `R2 object missing for D1 record: ${image.r2_key}`
      );

      return c.json(
        {
          error: "Image file is unavailable",
        },
        500
      );
    }

    const headers = new Headers();

    headers.set("Content-Type", image.content_type);
    headers.set("Content-Length", String(image.size_bytes));
    headers.set("Cache-Control", "private, max-age=3600");

    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Failed to retrieve image file:", error);

    return c.json(
      {
        error: "Failed to retrieve image file",
      },
      500
    );
  }
});

/**
 * DELETE /images/:id
 *
 * Delete R2 object and D1 metadata.
 */
app.delete("/images/:id", apiKeyAuth, async (c) => {
  const id = c.req.param("id");

  let image: {
    id: string;
    r2_key: string;
    content_type: string;
  } | null = null;

  try {
    image = await c.env.DB
      .prepare(`
        SELECT
          id,
          r2_key,
          content_type
        FROM images
        WHERE id = ?
      `)
      .bind(id)
      .first<{
        id: string;
        r2_key: string;
        content_type: string;
      }>();
  } catch (error) {
    console.error("Failed to find image for deletion:", error);

    return c.json(
      {
        error: "Failed to delete image",
      },
      500
    );
  }

  if (!image) {
    return c.json(
      {
        error: "Image not found",
      },
      404
    );
  }

  /**
   * Capture the R2 object before deleting it.
   * Used for recovery if D1 deletion fails.
   */
  let originalObjectBody: ArrayBuffer;

  try {
    const object = await c.env.IMAGES.get(image.r2_key);

    if (!object) {
      return c.json(
        {
          error: "Image file is unavailable",
        },
        500
      );
    }

    originalObjectBody = await object.arrayBuffer();
  } catch (error) {
    console.error("Failed to read R2 object:", error);

    return c.json(
      {
        error: "Failed to delete image",
      },
      500
    );
  }

  /**
   * Delete R2 object first.
   */
  try {
    await c.env.IMAGES.delete(image.r2_key);
  } catch (error) {
    console.error("R2 delete failed:", error);

    return c.json(
      {
        error: "Failed to delete image file",
      },
      500
    );
  }

  /**
   * Delete D1 metadata.
   */
  try {
    const deleteResult = await c.env.DB
      .prepare(`
        DELETE FROM images
        WHERE id = ?
      `)
      .bind(id)
      .run();

    if (deleteResult.meta.changes !== 1) {
      throw new Error(
        "D1 delete did not remove the expected record"
      );
    }
  } catch (error) {
    console.error("D1 delete failed:", error);

    /**
     * Restore R2 object if D1 deletion fails.
     */
    try {
      await c.env.IMAGES.put(
        image.r2_key,
        originalObjectBody,
        {
          httpMetadata: {
            contentType: image.content_type,
          },
        }
      );

      return c.json(
        {
          error: "Failed to delete image metadata",
          message: "R2 object was restored",
        },
        500
      );
    } catch (restoreError) {
      console.error(
        "Failed to restore R2 object after D1 failure:",
        restoreError
      );

      return c.json(
        {
          error:
            "Image deletion failed and storage recovery also failed",
        },
        500
      );
    }
  }

  return c.json({
    message: "Image deleted successfully",
    id,
  });
});

export default app;