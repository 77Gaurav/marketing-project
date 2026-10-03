# Database Schema Documentation — String Theory

This document outlines the relational database schema for the **String Theory** advertising platform.

---

## 1. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    users ||--o{ brands : "owns / manages"
    users ||--o{ stores : "owns / manages"
    users ||--o{ campaigns : "created by"
    brands ||--o{ campaigns : "owns"
    campaigns ||--o| campaign_videos : "has creative (1:1)"

    users {
        uuid id PK "gen_random_uuid()"
        text email UK "lowercase, validated"
        text full_name
        user_role role "BRAND | STORE | ADMIN"
        text phone "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    brands {
        uuid id PK "gen_random_uuid()"
        text name
        text slug UK "URL-friendly identifier"
        text website "nullable"
        uuid owner_user_id FK "users.id (ON DELETE SET NULL)"
        text contact_name
        text contact_email
        text contact_phone
        brand_status status "PENDING_REVIEW | ACTIVE | SUSPENDED"
        timestamptz created_at
        timestamptz updated_at
    }

    stores {
        uuid id PK "gen_random_uuid()"
        text name
        text slug UK "URL-friendly identifier"
        text location "Physical description / address"
        integer screen_count "Available display inventory"
        text website "nullable"
        uuid owner_user_id FK "users.id (ON DELETE SET NULL)"
        text contact_name "nullable"
        text contact_email
        text contact_phone "nullable"
        store_status status "PENDING_REVIEW | ACTIVE | PAUSED | CLOSED"
        timestamptz created_at
        timestamptz updated_at
    }

    campaigns {
        uuid id PK "gen_random_uuid()"
        uuid brand_id FK "brands.id (ON DELETE CASCADE)"
        text slug "Unique per brand (brand_id, slug)"
        text name
        text description "nullable"
        campaign_status status "DRAFT | IN_REVIEW | SCHEDULED | LIVE | PAUSED | COMPLETED | CANCELLED"
        date starts_on "nullable"
        date ends_on "nullable"
        uuid created_by FK "users.id (ON DELETE SET NULL)"
        timestamptz created_at
        timestamptz updated_at
    }

    campaign_videos {
        uuid id PK "gen_random_uuid()"
        uuid campaign_id FK,UK "campaigns.id (1:1 UNIQUE, ON DELETE CASCADE)"
        text source_filename
        text source_mime_type "nullable"
        bigint source_bytes "nullable"
        video_status status "AWAITING_UPLOAD | UPLOADING | UPLOADED | PROCESSING | ENCODING | RETRYING | READY | FAILED"
        text original_bucket "nullable"
        text original_key "nullable"
        text encoded_bucket "nullable"
        text encoded_key "nullable"
        integer width "nullable"
        integer height "nullable"
        numeric duration_seconds "nullable"
        text codec "nullable (e.g. h264)"
        integer bitrate_kbps "nullable"
        integer attempt_count "DEFAULT 0"
        text last_error "nullable"
        timestamptz uploaded_at "nullable"
        timestamptz encoded_at "nullable"
        timestamptz ready_at "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 2. Schema Architecture & Design Principles

- **PostgreSQL Core**: Uses `pgcrypto` (`gen_random_uuid()`) for non-enumerable primary keys and `timestamptz` across all tables.
- **Trigger-Driven `updated_at`**: Maintained automatically at the database level via the `st_set_updated_at()` trigger function.
- **Strict Database Invariants**: Extensive check constraints validate non-blank strings, lowercase emails, valid URL schemes, and logical date ranges (`ends_on >= starts_on`).
- **Referential Integrity**:
  - `brands.owner_user_id` / `stores.owner_user_id` / `campaigns.created_by`: Use `ON DELETE SET NULL` to preserve business and billing records if user accounts are removed.
  - `campaigns.brand_id` & `campaign_videos.campaign_id`: Use `ON DELETE CASCADE` to clean up associated campaign resources when a brand or campaign is deleted.

---

## 3. Tables & Enums Summary

| Table | Description | Primary Key | Foreign Keys / Relations |
| :--- | :--- | :--- | :--- |
| **`users`** | Authentication and RBAC identity (`BRAND`, `STORE`, `ADMIN`) | `id` (UUID) | None |
| **`brands`** | Brand customer accounts and business contacts | `id` (UUID) | `owner_user_id` &rarr; `users.id` |
| **`stores`** | Physical store display network venues and screen inventory | `id` (UUID) | `owner_user_id` &rarr; `users.id` |
| **`campaigns`** | Marketing campaigns scoped to brands with lifecycle states | `id` (UUID) | `brand_id` &rarr; `brands.id`, `created_by` &rarr; `users.id` |
| **`campaign_videos`** | 1:1 Creative video metadata, S3 keys, and transcoding pipeline states | `id` (UUID) | `campaign_id` &rarr; `campaigns.id` (1:1 UNIQUE) |

### Custom Enums:
- `user_role`: `'BRAND'`, `'STORE'`, `'ADMIN'`
- `brand_status`: `'PENDING_REVIEW'`, `'ACTIVE'`, `'SUSPENDED'`
- `store_status`: `'PENDING_REVIEW'`, `'ACTIVE'`, `'PAUSED'`, `'CLOSED'`
- `campaign_status`: `'DRAFT'`, `'IN_REVIEW'`, `'SCHEDULED'`, `'LIVE'`, `'PAUSED'`, `'COMPLETED'`, `'CANCELLED'`
- `video_status`: `'AWAITING_UPLOAD'`, `'UPLOADING'`, `'UPLOADED'`, `'PROCESSING'`, `'ENCODING'`, `'RETRYING'`, `'READY'`, `'FAILED'`
