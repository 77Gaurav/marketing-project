# String Theory — Store & Hardware Device Activation Specification

## 1. Overview

This document specifies the end-to-end device activation workflow for String Theory hardware screen players (e.g., Raspberry Pi display devices) deployed across partner venues and stores.

The system ensures:
- Secure store-level hardware binding.
- Enforced store readiness: activation codes can **only** be generated when a store is active.
- Strict 15-minute expiration windows for one-time activation codes.
- **Zero stale pending activations**: unactivated codes are purged automatically from PostgreSQL and never shown as pending once expired.
- Immediate cascading cleanup: deactivating or deleting a store deletes any running activations first.
- Dual-token issuance upon successful hardware activation: **ShortLivedToken** (3 days) and **RefreshToken** (1 month).

---

## 2. Admin Web Interface

### 2.1 Store Directory (`/admin/store`)
- **Route**: `app/admin/store/page.tsx`
- **Features**:
  - Lists every store in the venue network.
  - Displays location, inventory screen count, current store status (`ACTIVE`, `PAUSED`, `PENDING_REVIEW`, `CLOSED`), and contact details.
  - Search filter by name, slug, or location.
  - **Select Store**: Each venue card/row links directly to `/admin/store/:storeId`.

### 2.2 Store Management & Activation Console (`/admin/store/:storeId`)
- **Route**: `app/admin/store/[storeId]/page.tsx`
- **Features**:
  - **Store Name as Title**: Displays the store name prominently as the primary header (`<h1>{store.name}</h1>`).
  - **Store Activation Toggle**:
    - If store is not active: provides **"Activate Store"** (sets status to `ACTIVE`).
    - If store is active: provides **"Deactivate Store"** (sets status to `PAUSED`).
  - **Device Activation Enforcement**:
    - The **"Activate Display Device"** button is enabled **only** when `store.status === 'ACTIVE'`.
    - If the store is inactive, the activation button is disabled and an explanatory banner prompts the administrator to activate the store first.
  - **Live 15-Minute Activation Display**:
    - Displays auto-incremented Device ID and One-Time Activation Code.
    - Animated **15-minute countdown timer** with remaining minutes/seconds.
    - Copy-to-clipboard shortcuts.
    - Raspberry Pi hardware `curl` command ready for execution on the player terminal.
    - **"Deactivate / Cancel Code"** button to immediately delete the unactivated code.
    - Automatic expiry handler: when the 15-minute window closes without activation, the pending code is automatically deleted from PostgreSQL and cleared from the UI.
  - **Registered Devices Inventory**:
    - Displays all active screens bound to the store.
    - Option to deactivate active hardware players.

---

## 3. Activation Code Lifecycle & Rules

### 3.1 15-Minute Window
When an administrator clicks **"Activate Display Device"**:
1. Server checks that `store.status === 'ACTIVE'`.
2. PostgreSQL sequence `device_id_seq` yields the next auto-incremented `deviceId`.
3. A random 6-character activation code is minted (`ACT-XXXXXX`).
4. Device record is inserted with:
   - `status = 'Activation Pending'`
   - `expires_at = now() + INTERVAL '15 minutes'`
   - `created_at = now()`

### 3.2 Automatic Cleanup of Unactivated Codes
> *"If unactivated, don't show activation as pending, delete it"*

- The repository function `cleanupExpiredPendingDevices` runs automatically prior to:
  - Fetching devices for a store (`listDevicesForStore`).
  - Fetching devices network-wide (`listAllDevices`).
  - Creating a new pending device (`createPendingDevice`).
  - Receiving an activation request (`activateDeviceByCode`).
- Any device in `'Activation Pending'` or `'PENDING'` status whose expiration timestamp has passed (`expires_at < now()`) is permanently deleted from PostgreSQL (`DELETE FROM devices`).
- Expired unactivated codes are **never** displayed as pending in the console or API responses.

### 3.3 Cascading Deletion on Store Deactivation or Delete
> *"If store is Deactivated or Deleted by admin, If any activation is running, make sure we delete the activation first, then perform the store deactivation or store delete."*

1. **Store Deactivation (`status !== 'ACTIVE'`)**:
   - When an admin updates a store to `PAUSED` or `CLOSED` via `PATCH /api/admin/stores/:id` or `updateStoreStatus`:
   - Any running activation (`status IN ('Activation Pending', 'PENDING')`) for that store is deleted **first**.
   - The store's status is then updated.
2. **Store Deletion (`DELETE /api/admin/stores/:id`)**:
   - Before deleting the store from the `stores` table:
   - Any running activation (`status IN ('Activation Pending', 'PENDING')`) for that store is deleted **first**.
   - The store is then removed.

---

## 4. Hardware Player Activation API

### 4.1 Endpoint
- **URL**: `POST /admin/store/activate` *(also available at `/api/admin/store/activate`)*
- **Content-Type**: `application/json`

### 4.2 Request Body
Accepts both PascalCase and camelCase keys:
```json
{
  "DeviceId": "1",
  "ActivationCode": "ACT-X79K2P"
}
```

### 4.3 Successful Response (HTTP 200)
Upon valid activation within the 15-minute window:
1. Validates that the associated store is `ACTIVE`.
2. Transitions device status to `'Activated'` and sets `activated_at = now()`.
3. Mints two cryptographically signed HMAC-SHA256 tokens:
   - **ShortLivedToken**: Valid for **3 days** (`259,200` seconds). Used by the player for campaign retrieval and content playback.
   - **RefreshToken**: Valid for **1 month / 30 days** (`2,592,000` seconds). Used for automatic player re-authentication.
4. Returns:
```json
{
  "status": "Activated",
  "deviceId": "1",
  "ShortLivedToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "RefreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "shortLivedToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "storeId": "63f239fa-0ad0-46cd-a79b-091b7b50d75b"
}
```

### 4.4 Error Responses
- **Expired Activation Code (HTTP 410 / 404)**:
  ```json
  {
    "error": "Activation code has expired (valid for 15 minutes). Unactivated code deleted.",
    "status": "Error"
  }
  ```
- **Store Not Active (HTTP 400)**:
  ```json
  {
    "error": "Store is not active. Device activation is only permitted for active stores.",
    "status": "Error"
  }
  ```
- **Invalid Code (HTTP 400)**:
  ```json
  {
    "error": "Invalid activation code",
    "status": "Error"
  }
  ```

---

## 5. API Reference Summary

| Endpoint | Method | Description | Prerequisite |
| :--- | :--- | :--- | :--- |
| `/api/admin/stores` | `GET` | Lists all stores across the network | Admin session |
| `/api/admin/stores/:id` | `PATCH` | Updates store status (`ACTIVE`, `PAUSED`, etc.). Purges running activations on deactivation. | Admin session |
| `/api/admin/stores/:id` | `DELETE` | Removes a store. Purges running activations first. | Admin session |
| `/api/admin/store/devices` | `GET` | Lists devices for a store or network-wide (auto-cleans expired pending codes) | Admin session |
| `/api/admin/store/devices` | `POST` | Generates a 15-minute activation code | Store must be `ACTIVE` |
| `/api/admin/store/devices` | `DELETE` | Deactivates an active device or cancels a pending code | Admin session |
| `/admin/store/activate` | `POST` | Hardware activation endpoint called by Raspberry Pi players | Device must be pending & code valid |

---

## 6. Raspberry Pi Hardware Activation Example

Run the following command on the Raspberry Pi terminal once the administrator generates the activation code:

```bash
curl -X POST http://localhost:3000/admin/store/activate \
  -H "Content-Type: application/json" \
  -d '{
    "DeviceId": "1",
    "ActivationCode": "ACT-X79K2P"
  }'
```

Expected output:
```json
{
  "status": "Activated",
  "deviceId": "1",
  "ShortLivedToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "RefreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "storeId": "63f239fa-0ad0-46cd-a79b-091b7b50d75b"
}
```

---

## 7. Database Schema Reference

The `devices` table stores hardware display player registrations:

```sql
CREATE TABLE IF NOT EXISTS devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         text NOT NULL UNIQUE,
  activation_code   text,
  status            device_status NOT NULL DEFAULT 'ACTIVATED',
  store_id          uuid REFERENCES stores (id) ON DELETE SET NULL,
  access_token      text,
  refresh_token     text,
  expires_at        timestamptz,
  device_credential text,
  last_seen_at      timestamptz,
  activated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

- `device_id_seq`: Sequence providing clean integer-based IDs (`1`, `2`, `3`...).
- `expires_at`: Timestamp tracking the 15-minute lifetime of pending activation codes.
- `access_token`: Stores the active 3-day `ShortLivedToken`.
- `refresh_token`: Stores the active 1-month `RefreshToken`.
