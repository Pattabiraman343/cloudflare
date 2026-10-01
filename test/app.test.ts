import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
describe("Image API", () => {
  it("GET / returns API status", async () => {
    const response = await exports.default.fetch(
      "https://example.com/"
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body).toEqual({
      message: "Cloudflare Image API is running",
    });
  });

  it("POST /images rejects request without API key", async () => {
    const formData = new FormData();

    formData.append("title", "Test Image");
    formData.append(
      "file",
      new File(["test image"], "test.jpg", {
        type: "image/jpeg",
      })
    );

    const response = await exports.default.fetch(
      "https://example.com/images",
      {
        method: "POST",
        body: formData,
      }
    );

    expect(response.status).toBe(401);

    const body = await response.json();

    expect(body).toEqual({
      error: "Missing API key",
    });
  });

  it("POST /images rejects unsupported file type", async () => {
    const formData = new FormData();

    formData.append("title", "Test Image");
    formData.append(
      "file",
      new File(["test file"], "test.txt", {
        type: "text/plain",
      })
    );

    const response = await exports.default.fetch(
      "https://example.com/images",
      {
        method: "POST",
        headers: {
          "X-API-Key": "my-super-secret-test-key",
        },
        body: formData,
      }
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Only JPEG and PNG images are allowed",
    });
  });

  it("POST /images rejects empty file", async () => {
    const formData = new FormData();

    formData.append("title", "Test Image");
    formData.append(
      "file",
      new File([], "empty.jpg", {
        type: "image/jpeg",
      })
    );

    const response = await exports.default.fetch(
      "https://example.com/images",
      {
        method: "POST",
        headers: {
          "X-API-Key": "my-super-secret-test-key",
        },
        body: formData,
      }
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Image file cannot be empty",
    });
  });

  it("POST /images rejects missing title", async () => {
    const formData = new FormData();

    formData.append(
      "file",
      new File(["test image"], "test.jpg", {
        type: "image/jpeg",
      })
    );

    const response = await exports.default.fetch(
      "https://example.com/images",
      {
        method: "POST",
        headers: {
          "X-API-Key": "my-super-secret-test-key",
        },
        body: formData,
      }
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Title is required",
    });
  });

  it("DELETE /images/:id requires API key", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images/non-existing-id",
      {
        method: "DELETE",
      }
    );

    expect(response.status).toBe(401);

    const body = await response.json();

    expect(body).toEqual({
      error: "Missing API key",
    });
  });

  it("POST /images rejects title longer than 100 characters", async () => {
    const formData = new FormData();

    formData.append("title", "A".repeat(101));

    formData.append(
      "file",
      new File(["test image"], "test.jpg", {
        type: "image/jpeg",
      })
    );

    const response = await exports.default.fetch(
      "https://example.com/images",
      {
        method: "POST",
        headers: {
          "X-API-Key": "my-super-secret-test-key",
        },
        body: formData,
      }
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Title must be between 1 and 100 characters",
    });
  });

  it("POST /images rejects file larger than 5 MB", async () => {
    const formData = new FormData();

    const largeFile = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "large.jpg",
      {
        type: "image/jpeg",
      }
    );

    formData.append("title", "Large Image");
    formData.append("file", largeFile);

    const response = await exports.default.fetch(
      "https://example.com/images",
      {
        method: "POST",
        headers: {
          "X-API-Key": "my-super-secret-test-key",
        },
        body: formData,
      }
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Image size must not exceed 5 MB",
    });
  });

  it("DELETE /images/:id rejects invalid API key", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images/non-existing-id",
      {
        method: "DELETE",
        headers: {
          "X-API-Key": "wrong-api-key",
        },
      }
    );

    expect(response.status).toBe(401);

    const body = await response.json();

    expect(body).toEqual({
      error: "Invalid API key",
    });
  });

  it("GET /images returns paginated images", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images?page=1&limit=20"
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /images supports pagination limit", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images?page=1&limit=2"
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  it("GET /images rejects invalid page", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images?page=0&limit=20"
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Page must be a positive integer",
    });
  });

  it("GET /images rejects limit greater than 50", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images?page=1&limit=51"
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body).toEqual({
      error: "Limit cannot exceed 50",
    });
  });

  it("GET /images/:id returns 404 for unknown image", async () => {
    const response = await exports.default.fetch(
      "https://example.com/images/does-not-exist"
    );

    expect(response.status).toBe(404);

    const body = await response.json();

    expect(body).toEqual({
      error: "Image not found",
    });
  });
});