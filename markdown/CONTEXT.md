# Product Context — String Theory

## Product
String Theory is an AI-powered advertising platform connecting brands with physical stores/display locations that match their target audience.

## Core Experience
- Brands create and manage advertising campaigns.
- Define target audiences.
- Discover stores matching the target audience.
- Select stores for advertising using OpenFreeMap.
- Upload and optimize advertising videos.
- Deploy campaigns to connected digital displays.
- Track campaign performance and analytics.

## Dashboards

### Admin Dashboard
- View/manage all brands.
- View/manage all stores and display locations.
- Monitor campaigns, videos, and platform activity.

### Brand Dashboard
- Manage brand profile and campaigns.
- Define target audience.
- Discover matching stores.
- Browse stores on a map.
- Select stores for advertising.
- Upload/manage videos.
- View campaign analytics.

## Video Upload Pipeline
Video processing must be represented as an explicit state machine in the UI.

`UPLOADING → UPLOADED → PROCESSING → ENCODING → READY`

Failure path:

`PROCESSING/ENCODING → RETRYING → PROCESSING/ENCODING`

- Upload original video to temporary S3 storage.
- Process asynchronously using background jobs.
- Encode video to H.264.
- Use exponential backoff for failed processing/retries.
- Show current state, progress, retry count, and errors in the UI.
- After successful H.264 encoding and verification, delete the original video.
- Store the final video in S3.
- PostgreSQL stores brand data, campaign data, video metadata, processing state, S3 references, timestamps, and relevant processing information.
- Never delete the original before successful encoding/verification.

## Location Discovery
- OpenFreeMap API for maps and location discovery.
- Store location and audience-related metadata.
- Flow: `Brand → Target Audience → Matching Stores → Select Stores → Advertise`.

## Tech Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- GSAP
- PostgreSQL
- AWS S3 — video/image storage
- AWS compute/services — backend and processing
- OpenFreeMap API — maps/location discovery

## Engineering
Production-grade architecture with secure authentication, role-based access control, asynchronous processing, reliable APIs, media optimization, retries, logging, and observability.

## Design
Premium, cinematic, motion-focused interface. Avoid generic SaaS/dashboard aesthetics and AI-slop visuals. Motion should communicate the relationship between brands, audiences, stores, videos, and campaigns.