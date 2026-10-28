# QuickNotes API Design Specification

This document details the RESTful API contract for the QuickNotes service, including endpoints, request/response payloads, and error status handling.

---

## 1. REST Endpoints

| HTTP Method | Path | Description | Success Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/notes` | Retrieve a paginated list of notes for the authenticated user | `200 OK` |
| `POST` | `/api/v1/notes` | Create a new note | `201 Created` |
| `GET` | `/api/v1/notes/{id}` | Retrieve a specific note by ID | `200 OK` |
| `PUT` | `/api/v1/notes/{id}` | Replace/update an existing note entirely | `200 OK` |
| `PATCH` | `/api/v1/notes/{id}` | Partially update an existing note (e.g., mark as pinned/archived) | `200 OK` |
| `DELETE` | `/api/v1/notes/{id}` | Permanently delete a note by ID | `204 No Content` |
| `GET` | `/api/v1/notes/search` | Search notes matching text queries and tags | `200 OK` |

---

## 2. Request and Response Examples

### 2.1. Listing Notes (`GET /api/v1/notes?limit=10&page=1`)

#### Request
```http
GET /api/v1/notes?limit=10&page=1 HTTP/1.1
Host: api.quicknotes.example.com
Authorization: Bearer <access_token>
Accept: application/json
```

#### Response (`200 OK`)
```json
{
  "data": [
    {
      "id": "note_92fa71e0",
      "title": "System Architecture Review",
      "body": "Prepare architecture diagram and review latency targets for the caching layer.",
      "pinned": true,
      "tags": ["work", "architecture"],
      "created_at": "2026-10-28T10:15:30Z",
      "updated_at": "2026-10-28T11:42:10Z"
    },
    {
      "id": "note_41bc38d2",
      "title": "Grocery Shopping List",
      "body": "Milk, sourdough bread, dark roast coffee beans, olive oil.",
      "pinned": false,
      "tags": ["personal"],
      "created_at": "2026-10-27T18:05:12Z",
      "updated_at": "2026-10-27T18:05:12Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "limit": 10,
    "total_items": 42,
    "total_pages": 5
  }
}
```

---

### 2.2. Creating a Note (`POST /api/v1/notes`)

#### Request
```http
POST /api/v1/notes HTTP/1.1
Host: api.quicknotes.example.com
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json

{
  "title": "Team Standup Action Items",
  "body": "Follow up with DevOps regarding production deployment pipeline timeouts.",
  "pinned": false,
  "tags": ["work", "devops"]
}
```

#### Response (`201 Created`)
```json
{
  "data": {
    "id": "note_a6b189d4",
    "title": "Team Standup Action Items",
    "body": "Follow up with DevOps regarding production deployment pipeline timeouts.",
    "pinned": false,
    "tags": ["work", "devops"],
    "created_at": "2026-10-28T14:55:00Z",
    "updated_at": "2026-10-28T14:55:00Z"
  }
}
```

---

## 3. Error Handling and Status Codes

QuickNotes returns standard HTTP status codes along with a consistent error JSON envelope following the [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) Problem Details standard.

### Standard Error Status Codes

| Status Code | Reason Phrase | Description |
| :--- | :--- | :--- |
| `400` | Bad Request | The request payload is malformed or failed validation (e.g., missing title, title exceeds 100 characters). |
| `401` | Unauthorized | Missing, expired, or invalid authentication credentials (`Authorization` header). |
| `403` | Forbidden | Authenticated client does not have permission to access or modify the requested resource. |
| `404` | Not Found | The specified resource (e.g., `/api/v1/notes/{id}`) does not exist. |
| `500` | Internal Server Error | An unexpected server-side error occurred while processing the request. |

---

### Example Error Response Payloads

#### Example: `400 Bad Request` (Validation Failure)
```json
{
  "error": {
    "status": 400,
    "code": "VALIDATION_FAILED",
    "message": "The request body failed schema validation.",
    "details": [
      {
        "field": "title",
        "issue": "Title must be between 1 and 100 characters."
      }
    ],
    "timestamp": "2026-10-28T14:56:02Z",
    "path": "/api/v1/notes"
  }
}
```

#### Example: `401 Unauthorized`
```json
{
  "error": {
    "status": 401,
    "code": "UNAUTHORIZED",
    "message": "Authentication token is missing or has expired.",
    "timestamp": "2026-10-28T14:56:15Z",
    "path": "/api/v1/notes"
  }
}
```

#### Example: `403 Forbidden`
```json
{
  "error": {
    "status": 403,
    "code": "FORBIDDEN",
    "message": "You do not have permission to delete this note.",
    "timestamp": "2026-10-28T14:56:28Z",
    "path": "/api/v1/notes/note_999"
  }
}
```

#### Example: `404 Not Found`
```json
{
  "error": {
    "status": 404,
    "code": "NOTE_NOT_FOUND",
    "message": "Note with ID 'note_nonexistent' was not found.",
    "timestamp": "2026-10-28T14:56:40Z",
    "path": "/api/v1/notes/note_nonexistent"
  }
}
```

#### Example: `500 Internal Server Error`
```json
{
  "error": {
    "status": 500,
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred while processing your request. Please try again later.",
    "timestamp": "2026-10-28T14:56:55Z",
    "path": "/api/v1/notes"
  }
}
```
