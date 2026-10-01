# Cloudflare Image API

Simple Image Upload REST API built using Cloudflare Workers.

## Tech Stack

* Cloudflare Workers
* Hono
* Cloudflare D1
* Cloudflare R2
* TypeScript
* Vitest

## Live API

https://pattabi-raman-api.backend-interview-sandbox.workers.dev

Health Check:

```text
GET /
```

Response:

```json
{
  "message": "Cloudflare Image API is running"
}
```

## Features

* Upload JPEG and PNG images
* Maximum file size: 5 MiB
* Title length: 1 to 100 characters
* Store image file in private R2
* Store image details in D1
* List images with pagination
* Get image details
* Get image file
* Delete image
* API key authentication for upload and delete

## API Endpoints

### Upload Image

```text
POST /images
```

Header:

```text
X-API-Key: <API_KEY>
```

Form data:

```text
title: My Image
file: image.jpg
```

### List Images

```text
GET /images?page=1&limit=20
```

### Get Image Details

```text
GET /images/{id}
```

### Get Image File

```text
GET /images/{id}/file
```

### Delete Image

```text
DELETE /images/{id}
```

Header:

```text
X-API-Key: <API_KEY>
```

## Database

Image metadata is stored in Cloudflare D1.

Table:

```text
images
```

Fields:

```text
id
title
r2_key
content_type
size_bytes
created_at
```

Image files are stored in a private Cloudflare R2 bucket.

## Local Setup

Install dependencies:

```powershell
npm install
```

Run locally:

```powershell
npx wrangler dev
```

Run tests:

```powershell
npm test -- --run
```

Check TypeScript:

```powershell
npx tsc --noEmit
```

## Deployment

Authenticate:

```powershell
. .\Connect-Cloudflare.ps1
```

Deploy:

```powershell
npx wrangler deploy
```

Set API key:

```powershell
npx wrangler secret put API_KEY
```

## Testing

Automated tests:

```text
14 / 14 passed
```

Tested features:

* API health check
* API key validation
* Image validation
* File size validation
* Title validation
* Pagination
* Image not found handling

Live testing was also completed for:

* Upload
* Image listing
* Image details
* File retrieval
* Delete

## Project

GitHub:

https://github.com/Pattabiraman343/cloudflare

Portfolio:

https://portfolio-pvg5.vercel.app/

## Candidate

**Name:** Pattabi Raman
**City:** Coimbatore
**Notice Period:** Immediate Joiner
**Bangalore Relocation:** Yes

**Expected Monthly Salary:** [Your expected salary]

**Time Spent:** [Your approximate time]
