import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/auth";

type Bindings = {
  image_db: D1Database;
  API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Health check
app.get("/", (c) => {
  return c.json({
    message: "Cloudflare Image API is running",
  });
});

// POST /images
app.post("/images", apiKeyAuth, async (c) => {
  const body = await c.req.parseBody();

  const title = body.title;
  const file = body.file;

  // Validate title
  if (typeof title !== "string") {
    return c.json(
      {
        error: "Title is required",
      },
      400
    );
  }

  if (title.trim().length < 1 || title.length > 100) {
    return c.json(
      {
        error: "Title must be between 1 and 100 characters",
      },
      400
    );
  }

  // Validate file exists
  if (!(file instanceof File)) {
    return c.json(
      {
        error: "Image file is required",
      },
      400
    );
  }

  // Validate empty file
  if (file.size === 0) {
    return c.json(
      {
        error: "Image file cannot be empty",
      },
      400
    );
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png"];

  if (!allowedTypes.includes(file.type)) {
    return c.json(
      {
        error: "Only JPEG and PNG images are allowed",
      },
      400
    );
  }

  // Validate file size: 5 MB maximum
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      {
        error: "Image size must not exceed 5 MB",
      },
      400
    );
  }

  // Generate unique image ID
  const id = crypto.randomUUID();

  // R2 object key
  // R2 upload is pending for now
  const r2Key = `images/${id}`;

  // Creation timestamp
  const createdAt = new Date().toISOString();

  // Save image metadata in D1
  await c.env.image_db
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
      title.trim(),
      r2Key,
      file.type,
      file.size,
      createdAt
    )
    .run();

  return c.json(
    {
      id,
      title: title.trim(),
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      createdAt,
      fileUrl: `/images/${id}/file`,
      r2Key,
      message: "Image metadata saved successfully",
    },
    201
  );
});
app.get("/images", async (c) => {
	const pageParam = c.req.query("page") || "1";
	const limitParam = c.req.query("limit") || "20";
  
	const page = Number(pageParam);
	const limit = Number(limitParam);
  
	// Validate page
	if (!Number.isInteger(page) || page < 1) {
	  return c.json(
		{
		  error: "Page must be a positive integer",
		},
		400
	  );
	}
  
	// Validate limit
	if (!Number.isInteger(limit) || limit < 1) {
	  return c.json(
		{
		  error: "Limit must be a positive integer",
		},
		400
	  );
	}
  
	// Maximum limit is 50
	if (limit > 50) {
	  return c.json(
		{
		  error: "Limit cannot exceed 50",
		},
		400
	  );
	}
  
	const offset = (page - 1) * limit;
  
	const result = await c.env.image_db
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
	  .all();
  
	return c.json({
	  page,
	  limit,
	  data: result.results,
	});
  });

  app.get("/images/:id", async (c) => {
	const id = c.req.param("id");
  
	const result = await c.env.image_db
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
	  .first();
  
	if (!result) {
	  return c.json(
		{
		  error: "Image not found",
		},
		404
	  );
	}
  
	return c.json({
	  ...result,
	  fileUrl: `/images/${id}/file`,
	});
  });

  app.get("/images/:id/file", async (c) => {
	const id = c.req.param("id");
  
	const image = await c.env.image_db
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
  
	if (!image) {
	  return c.json(
		{
		  error: "Image not found",
		},
		404
	  );
	}
  
	return c.json(
	  {
		error: "R2 storage is not configured yet",
		id: image.id,
		r2Key: image.r2_key,
	  },
	  503
	);
  });

  app.delete("/images/:id", apiKeyAuth, async (c) => {
	const id = c.req.param("id");
  
	const image = await c.env.image_db
	  .prepare(`
		SELECT
		  id,
		  r2_key
		FROM images
		WHERE id = ?
	  `)
	  .bind(id)
	  .first<{
		id: string;
		r2_key: string;
	  }>();
  
	if (!image) {
	  return c.json(
		{
		  error: "Image not found",
		},
		404
	  );
	}
  
	return c.json(
	  {
		error: "R2 storage is not configured yet",
		message: "Delete operation is pending R2 integration",
		id: image.id,
		r2Key: image.r2_key,
	  },
	  503
	);
  });
export default app;