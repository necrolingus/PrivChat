# PrivChat — Zero-Knowledge End-to-End Encrypted Private Messaging Platform

PrivChat is a high-security, zero-knowledge real-time messaging application designed for absolute privacy. It provides client-side End-to-End Encryption (E2EE) for text messages and photo uploads, server-side CSPRNG unique phrase generation with collision safety, configurable Private Server Mode (`PRIVATE_SERVER=true`), an Admin Control Center (`/admin`), single-use owner invites, ECDSA message signing, global Notification Center, and owner join approvals.

---

## Table of Contents
1. [Architecture & How the App Works](#architecture--how-the-app-works)
2. [Complete Cryptographic Data Flow & Database Mapping Guide](#complete-cryptographic-data-flow--database-mapping-guide)
3. [Private Server Mode & Admin Control Center (/admin)](#private-server-mode--admin-control-center-admin)
4. [Security Model & User Privacy Guarantees](#security-model--user-privacy-guarantees)
5. [High-Level API Reference](#high-level-api-reference)
6. [Installation & Setup Guide](#installation--setup-guide)
7. [Automated Testing & Code Coverage](#automated-testing--code-coverage-jest--supertest)

---

## Architecture & How the App Works

PrivChat operates on a **Zero-Knowledge Architecture**. Encryption keys are derived entirely client-side inside your browser via Web Crypto APIs and are **never transmitted over the network or saved on server storage**.

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                    |
|                                                                                   |
|  12-Word Seed ---> PBKDF2-HMAC-SHA256 ---> Device ID + ECDSA P-256 Signing Key    |
|   6-Word Secret -> PBKDF2-HMAC-SHA256 ---> AES-256-GCM Encryption Key            |
|                                                                                   |
|  Payload = AES-256-GCM( Text / Image ) + ECDSA_Sign( Payload + DeviceID )         |
+-----------------------------------------+-----------------------------------------+
                                          | (Encrypted Ciphertext + Signature)
                                          v
+-----------------------------------------------------------------------------------+
|                               EXPRESS + SOCKET.IO SERVER                          |
|                                                                                   |
|  - Private Server Mode (PRIVATE_SERVER=true) & Admin Control Dashboard (/admin)   |
|  - Generates unique 12/6-word phrases via CSPRNG + DB Collision Safety            |
|  - Relays encrypted ciphertexts over WebSockets                                   |
|  - Stores ciphertexts in PostgreSQL (tbl_chatapp_messages)                        |
|  - Enforces ACLs, Single-Use Invites & Owner Join Approvals                        |
|  - Stores server-side display profiles by Device ID (tbl_chatapp_profiles)        |
|  - ZERO ACCESS to plaintext data or private keys                                 |
+-----------------------------------------------------------------------------------+
```

---

## Complete Cryptographic Data Flow & Database Mapping Guide

This section explicitly breaks down **what gets generated where and when**, how **client-side browser storage** maps to **PostgreSQL database tables and columns**, and how tokens, IVs, epoch counters, and cryptographic keys interact across the full application lifecycle.

### 1. Client-Side Browser Storage vs Server-Side PostgreSQL Storage

```
+---------------------------------------------------------------------------------------------------+
|                                     CLIENT-SIDE STORAGE (BROWSER)                                 |
+--------------------------+---------------------------------------------------+--------------------+
| Variable / Key           | Location                                          | Purpose            |
+--------------------------+---------------------------------------------------+--------------------+
| 12-Word Identity Seed    | User Memory / Optional LocalStorage (7-day opt)   | Identity Key       |
| 6-Word Channel Keys      | privchat_channel_vault (LocalStorage)             | E2EE Decryption    |
| Device ID Hash           | Memory Derived (SHA-256 HMAC)                     | Client Identity    |
| ECDSA P-256 Keypair      | WebCrypto SubtleCrypto (In-Memory Keypair)         | Digital Signature  |
| Admin Token              | sessionStorage (privchat_admin_token)             | /admin API Auth    |
+--------------------------+---------------------------------------------------+--------------------+

                                              ||
                                              || Encrypted Payloads & Hashes
                                              \/

+---------------------------------------------------------------------------------------------------+
|                                  SERVER-SIDE POSTGRESQL DATABASE                                  |
+-------------------------------+-----------------------------------+-------------------------------+
| PostgreSQL Table              | Stored Columns / Data             | Privacy Guarantee             |
+-------------------------------+-----------------------------------+-------------------------------+
| tbl_chatapp_profiles          | device_id, friendly_name          | ZERO private keys stored      |
| tbl_chatapp_channels          | channel_id, owner_device_id       | Stores SHA-256 hash of 6-words|
| tbl_chatapp_channel_members   | channel_id, device_id, status     | ACL membership tracking       |
| tbl_chatapp_messages          | encrypted_content, iv, signature  | AES-256 Ciphertext & IV only  |
| tbl_chatapp_invites           | invite_code, is_used, used_by     | Single-Use Invite PIN locks   |
| tbl_chatapp_server_tokens     | token, type, is_revoked, used_count| Private Server Access Control |
+-------------------------------+-----------------------------------+-------------------------------+
```

### 2. End-to-End Cryptographic Lifecycle (Step-by-Step)

#### Step 1: User Registration & Identity Derivation
- **Generation Point**: Server-side CSPRNG (`/api/generate/identity-phrase`) generates a 12-word seed phrase selected from the BIP-39 2,048-word dictionary ($2^{132}$ entropy).
- **Client Derivation**:
  1. `deriveDeviceId(phrase)`: Performs PBKDF2-HMAC-SHA256 (100,000 iterations) -> SHA-256 Hex Hash = `deviceId` (e.g. `1d9ca00b...`).
  2. `generateECDSAKeypair()`: Derives an **ECDSA (P-256)** signing keypair. The public key `public_signing_key` is registered in `tbl_chatapp_channel_members`, while the private key is held strictly in browser memory.
- **Server DB Storage (`tbl_chatapp_profiles`)**:
  - `device_id`: Derived SHA-256 HMAC string (Primary Key).
  - `friendly_name`: User display name (e.g. `Alice`).
  - `authorized_on_server`: Set to `true` when device is validated against a Private Server Invite Token.

#### Step 2: Server Access Token Verification (Private Server Mode)
- **Generation Point**: Server Admin generates tokens via `/admin` (`POST /api/admin/tokens/create`).
- **Server DB Storage (`tbl_chatapp_server_tokens`)**:
  - `id`: UUID Primary Key.
  - `token`: Alphanumeric token string (e.g. `SRV-TEAM123`).
  - `type`: `'one_time'` (consumed after 1 registration) or `'forever'` (reusable across multiple users).
  - `is_revoked`: Boolean flag. If `true`, the token is immediately invalidated.
  - `used_count`: Incremented integer tracking how many device registrations consumed this token.
  - `last_used_by`: Stores `device_id` of the last user who registered with this token.

#### Step 3: Channel Creation & 6-Word Key Hashing
- **Generation Point**: Server-side CSPRNG (`/api/generate/channel-phrase`) generates a 6-word key ($2^{66}$ entropy).
- **Client Derivation**:
  - The client derives the **Channel ID** via `sha256Hex(phrase)` = `channel_id` (e.g. `ac7f3d191f7c...`).
  - The client derives the `AES-256-GCM` symmetric encryption key via `PBKDF2-HMAC-SHA256(phrase, salt="privchat-salt", iterations=100000)`.
  - The 6-word phrase is stored in the browser's local key vault (`privchat_channel_vault`).
- **Server DB Storage (`tbl_chatapp_channels`)**:
  - `channel_id`: SHA-256 Hex Hash of the 6-word key. **The server NEVER stores the 6-word key itself!**
  - `owner_device_id`: `device_id` of the channel creator.
  - `requires_approval`: Boolean (`true` by default).

#### Step 4: Channel Invites & Single-Use PINs (`tbl_chatapp_invites`)
- **Generation Point**: Channel Owner generates single-use PINs (`/api/channels/create-invite`) formatted as `INV-XXXXXX`.
- **Server DB Storage (`tbl_chatapp_invites`)**:
  - `id`: UUID Primary Key.
  - `invite_code`: `INV-8F92A3`.
  - `channel_id`: Target channel hash.
  - `is_used`: Marked `true` as soon as a non-owner joins using this PIN.
  - `used_by_device_id`: Stores the `device_id` of the member who consumed the PIN.
  - **Security Guarantee**: Once `is_used = true`, PostgreSQL locks the PIN permanently. It can NEVER be reused or recycled by kicked members.

#### Step 5: Encrypted Messaging (`tbl_chatapp_messages`)
- **Encryption Process (Client Side)**:
  1. Sender generates a unique **12-byte random Initialization Vector (IV)** via `window.crypto.getRandomValues(new Uint8Array(12))`.
  2. Plaintext message text (or base64 image) is encrypted via `AES-256-GCM(key, iv, plaintext)`.
  3. Sender creates an **ECDSA (P-256) Digital Signature** over `(channelId + ciphertext + iv + deviceId + epoch)` to guarantee payload integrity and prevent sender spoofing.
- **Server DB Storage (`tbl_chatapp_messages`)**:
  - `message_id`: UUID Primary Key.
  - `channel_id`: Target channel hash.
  - `sender_device_id`: Sender's derived `device_id`.
  - `sender_name`: Sender's friendly display name (e.g. `Alice`).
  - `encrypted_content`: Base64 string of the AES-256-GCM ciphertext.
  - `iv`: Base64 string of the 12-byte random IV.
  - `signature`: ECDSA P-256 digital signature string.
  - `epoch`: Integer counter (default `1`) incremented for key rotation epochs.
  - `created_at`: UTC Timestamp of message transmission.

---

### 3. Complete Database Schema Field Reference

| Table Name | Column Name | Data Type | Key / Constraint | Description & Cryptographic Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `tbl_chatapp_profiles` | `device_id` | `String` | `@id` (Primary Key) | SHA-256 HMAC hash derived client-side from 12-word identity seed phrase. |
| `tbl_chatapp_profiles` | `friendly_name` | `String` | Required | User's custom display name (e.g. `Alice`). |
| `tbl_chatapp_profiles` | `authorized_on_server` | `Boolean` | Default `false` | Set to `true` when device is validated against a Private Server Invite Token. |
| `tbl_chatapp_profiles` | `created_at` / `updated_at` | `DateTime` | Automatic | Profile creation and last update timestamps. |
| `tbl_chatapp_channels` | `channel_id` | `String` | `@id` (Primary Key) | SHA-256 hex hash of 6-word channel key. Server never sees 6-word plaintext key. |
| `tbl_chatapp_channels` | `owner_device_id` | `String` | Required | `device_id` of the channel creator/owner. |
| `tbl_chatapp_channels` | `requires_approval` | `Boolean` | Default `true` | When `true`, non-owners enter `pending` state until owner approves join. |
| `tbl_chatapp_channels` | `privacy_mode` | `String` | Default `"restricted"` | Access mode for channel joining. |
| `tbl_chatapp_channels` | `created_at` | `DateTime` | Default `now()` | Channel creation timestamp. |
| `tbl_chatapp_channel_members` | `id` | `Int` | `@id` (Autoincrement) | Internal member row identifier. |
| `tbl_chatapp_channel_members` | `channel_id` | `String` | Foreign Key (Cascade) | Associated channel ID. |
| `tbl_chatapp_channel_members` | `device_id` | `String` | Required | Derived `device_id` of member. |
| `tbl_chatapp_channel_members` | `status` | `String` | Default `"active"` | Membership status (`'pending'`, `'active'`, `'left'`, `'kicked'`, `'denied'`). |
| `tbl_chatapp_channel_members` | `public_signing_key` | `Text?` | Optional | ECDSA P-256 public key exported by client for digital signature verification. |
| `tbl_chatapp_messages` | `message_id` | `String` | `@id` (UUID) | Unique message identifier. |
| `tbl_chatapp_messages` | `channel_id` | `String` | Foreign Key (Cascade) | Channel where message was posted. |
| `tbl_chatapp_messages` | `sender_device_id` | `String` | Required | `device_id` of message sender. |
| `tbl_chatapp_messages` | `sender_name` | `String` | Required | Display name of sender at time of posting. |
| `tbl_chatapp_messages` | `encrypted_content` | `Text` | Required | AES-256-GCM encrypted ciphertext (Base64). Plaintext unavailable to server. |
| `tbl_chatapp_messages` | `iv` | `String` | Required | Unique 12-byte random Initialization Vector (Base64) generated per message. |
| `tbl_chatapp_messages` | `signature` | `Text?` | Optional | ECDSA P-256 digital signature proving message authenticity and payload integrity. |
| `tbl_chatapp_messages` | `epoch` | `Int` | Default `1` | Cryptographic key rotation epoch version. |
| `tbl_chatapp_messages` | `created_at` | `DateTime` | Default `now()` | Server creation timestamp. |
| `tbl_chatapp_invites` | `id` | `String` | `@id` (UUID) | Unique invite record ID. |
| `tbl_chatapp_invites` | `invite_code` | `String` | Required | Single-use invite PIN (e.g. `INV-8F92A3`). |
| `tbl_chatapp_invites` | `channel_id` | `String` | Foreign Key (Cascade) | Target channel ID. |
| `tbl_chatapp_invites` | `is_used` | `Boolean` | Default `false` | Locked to `true` once consumed. Hardened against reactivation or recycling. |
| `tbl_chatapp_invites` | `used_by_device_id` | `String?` | Optional | `device_id` of member who consumed the PIN. |
| `tbl_chatapp_server_tokens` | `id` | `String` | `@id` (UUID) | Unique server token ID. |
| `tbl_chatapp_server_tokens` | `token` | `String` | `@unique` | Server invite token string generated by admin. |
| `tbl_chatapp_server_tokens` | `type` | `String` | Required | `'one_time'` (single registration) or `'forever'` (reusable across multiple users). |
| `tbl_chatapp_server_tokens` | `is_revoked` | `Boolean` | Default `false` | When `true`, token is immediately invalidated by admin. |
| `tbl_chatapp_server_tokens` | `used_count` | `Int` | Default `0` | Counter tracking registrations using this token. |
| `tbl_chatapp_server_tokens` | `last_used_by` | `String?` | Optional | `device_id` of the last user who registered with this token. |

---

## Private Server Mode & Admin Control Center (/admin)

PrivChat supports deployment as a public platform or as a **Private Self-Hosted Instance**.

### Configuration via `.env`:
```env
# Enable Private Server Mode (Requires valid Server Invite Tokens to register)
PRIVATE_SERVER=true

# Server Admin Authentication Key (MUST be alphanumeric and at least 32 characters long)
PRIVATE_SERVER_KEY=SuperSecretAdminPrivateKey32CharsLong
```

### Admin Web Dashboard (`/admin`):
- **Access**: Open `/admin` in your browser and enter your 32+ character `PRIVATE_SERVER_KEY`.
- **Brute-Force Protection**: The `/api/admin/login` endpoint is heavily rate limited (5 attempts per 15 minutes). Server startup aborts if `PRIVATE_SERVER_KEY` is under 32 characters.
- **Server Token Creator**: Generate **1-Time Use Tokens** (consumed upon registration) or **Forever Tokens** (reusable across multiple users). Optional custom codes (e.g. `SRV-TEAM123`).
- **Token Monitoring & Emergency Revocation**: Inspect generated tokens, usage counters, and associated device IDs with friendly display names. Admin can **Revoke / Invalidate** any token instantly to cut off access.

---

## Security Model & User Privacy Guarantees

### 1. Entropy & Brute Force Immunity
- **12-Word Identity Phrase**: $2048^{12} = 2^{132} \approx 5.44 \times 10^{39}$ combinations (132-bit entropy). Server-side uniqueness verification prevents birthday-attack collisions.
- **6-Word Channel Key**: $2048^6 = 2^{66} \approx 7.37 \times 10^{19}$ combinations (66-bit entropy). Offline dictionary attacks are mitigated by 100,000 PBKDF2 iterations; online probing is blocked by mandatory One-Time Invite PINs, Owner Join Approvals, and rate limiting.

### 2. Impersonation Protection (ECDSA P-256 Signatures)
- Every device generates an **ECDSA (P-256)** digital signature over `(channelId + ciphertext + iv + deviceId)` for every message.
- Third parties cannot forge messages under another member's Device ID.

### 3. OTP Non-Reuse Security Hardening
- Even if a member gets kicked and creates a brand new 12-word identity (new `deviceId`), they CANNOT re-use the consumed OTP (`is_used = true`).
- Consumed OTPs are locked permanently in PostgreSQL and cannot be recycled or reactivated.

### 4. Server-Side Strict Phrase Generation & Timing Attack Defense
- Client-side wordlists and phrase generators are completely removed.
- All phrases are generated server-side using CSPRNG with database uniqueness checks.
- Every generation response includes a 50–200ms randomized artificial delay so attackers cannot determine if a collision occurred or probe existing entries via response latency.

---

## High-Level API Reference

### Admin REST Endpoints (`/api/admin`)
- `GET /api/admin/config`: Returns `{ isPrivateServer: boolean }` (Public).
- `POST /api/admin/login`: Authenticates admin using 32+ char `PRIVATE_SERVER_KEY` (Rate limited: 5 req/15min).
- `POST /api/admin/tokens/create`: Generate 1-Time Use or Forever Server Invite Token (Admin auth required).
- `GET /api/admin/tokens`: Fetch all generated tokens with usage count, status, device ID & friendly name tracking (Admin auth required).
- `POST /api/admin/tokens/revoke`: Invalidate/revoke a token (Admin auth required).

### REST Endpoints (`/api/channels`, `/api/profile`, `/api/generate`)
- `POST /api/generate/identity-phrase`: Server-side CSPRNG 12-word identity phrase generation with DB uniqueness check, timing attack delay, and private server token validation.
- `POST /api/generate/channel-phrase`: Server-side CSPRNG 6-word channel key generation with DB uniqueness check and timing attack delay.
- `POST /api/channels/join`: Join/create channel (validates single-use invite PINs and private server token authorization).
- `GET /api/channels/my-channels?deviceId=...`: Fetch list of active channels for a device.
- `GET /api/channels/:channelId/messages?deviceId=...`: Fetch encrypted chat history (Active members only).
- `GET /api/channels/:channelId/members?deviceId=...`: Fetch active members with friendly display names.
- `POST /api/channels/create-invite`: Generate a single-use invite PIN `INV-XXXXXX` (Owner only).
- `POST /api/channels/approve-member`: Approve pending join request (Owner only).
- `POST /api/channels/deny-member`: Deny pending join request (Owner only).
- `POST /api/channels/leave`: Leave or permanently close/delete channel.
- `POST /api/channels/kick`: Permanently kick a member (Owner only).
- `POST /api/profile/save`: Save friendly display name server-side by `deviceId`.
- `GET /api/profile/:deviceId`: Retrieve stored friendly display name.

---

## Installation & Setup Guide

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database (at `192.168.1.109:5432` or configured via `.env`)

### Setup Commands

```bash
# 1. Install dependencies
npm install

# 2. Sync database schema
npx prisma db push

# 3. Start application server
node src/server/app.js
```

Application will run at `http://localhost:3000` (Admin panel at `http://localhost:3000/admin`).

---

## Automated Testing & Code Coverage (Jest & Supertest)

PrivChat includes a comprehensive **34-stage automated test suite** organized inside the `tests/` directory:

- **`tests/unit/crypto.test.js`**: Unit tests for SHA-256 hex hashing, string normalization, 12-word seed entropy math ($2^{132}$ combinations), and single-use invite code generation.
- **`tests/functional/channels.test.js`**: End-to-end functional tests for channel creation, invite code generation, active channels dashboard queries, owner pending queues, member approvals, kicking, and emergency dashboard closures.
- **`tests/security/access_control.test.js`**: Security penetration tests for single-use invite enforcement, consumed invite code rejection, history read blocking for pending/kicked users, non-owner route prohibition, owner channel deletion, profile persistence, OTP reactivation blocking, and server-side phrase generation endpoints.
- **`tests/security/private_server.test.js`**: Security penetration tests for Private Server Mode, 32-character `PRIVATE_SERVER_KEY` constraint, admin login rate limiting, 1-Time vs Forever token generation, token tracking, and token revocation/invalidation.

### Running Jest Tests & Code Coverage

```bash
# Execute Jest test suite and generate code coverage report
npm test
```

```bash
Test Suites: 4 passed, 4 total
Tests:       34 passed, 34 total
Snapshots:   0 total
Time:        3.657 s
```

