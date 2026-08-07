# PrivChat — Zero-Knowledge End-to-End Encrypted Private Messaging Platform

PrivChat is a high-security, zero-knowledge real-time messaging application designed for absolute privacy. It provides client-side End-to-End Encryption (E2EE) for text messages and photo uploads, cryptographic identity derivation, single-use owner invites, ECDSA message signing, interactive Notification Center, and owner join approvals.

---

## Table of Contents
1. [Architecture & How the App Works](#architecture--how-the-app-works)
2. [Security Model & User Privacy Guarantees](#security-model--user-privacy-guarantees)
3. [User Concerns & FAQ](#user-concerns--faq)
4. [High-Level API Reference](#high-level-api-reference)
5. [Installation & Setup Guide](#installation--setup-guide)
6. [Automated Testing & Code Coverage](#automated-testing--code-coverage-jest--supertest)

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
|  - Relays encrypted ciphertexts over WebSockets                                   |
|  - Stores ciphertexts in PostgreSQL (tbl_chatapp_messages)                        |
|  - Enforces ACLs, Single-Use Invites & Owner Join Approvals                        |
|  - Stores server-side display profiles by Device ID (tbl_chatapp_profiles)        |
|  - ZERO ACCESS to plaintext data or private keys                                 |
+-----------------------------------------------------------------------------------+
```

### Key Application Workflows

1. **Identity Setup & Server-Side Display Name Profile**:
   - New users are issued a random **12-word identity phrase** derived from the BIP-39 2,048-word dictionary ($2^{132}$ key space).
   - Returning users enter their 12-word phrase to recover their non-identifiable Device ID and ECDSA P-256 signing key pair.
   - User display names are persisted server-side by Device ID (`tbl_chatapp_profiles`) and restored automatically upon login.
   - Users choose their **Session Security Preference**: Remember Me (7-day `localStorage`) vs Session Only (`sessionStorage` wiped on browser exit).

2. **Channel Creation & Access Control**:
   - Channels are encrypted using a **6-word channel key**.
   - Channel owners generate **One-Time Invite PINs** (`INV-XXXXXX`) to invite members. Non-owner joiners must present both the 6-word channel key AND a valid, unused PIN.
   - Creating a channel automatically generates an initial single-use invite PIN while allowing custom entries (e.g. `tester123`).
   - Non-owner joiners enter a `pending` approval state until the channel owner explicitly approves their access.

3. **Interactive Notification Center**:
   - Replaces intrusive modals with a header Notification Bell and real-time unread badge counter.
   - Clicking the bell opens a popover dropdown displaying pending join requests with inline **Approve** and **Deny** buttons, kick/leave alerts, and action status notifications.

4. **E2EE Messaging & Media Sharing**:
   - All messages and photos are encrypted in browser memory using **AES-256-GCM** before hitting the wire.
   - The chat interface features a stable, fixed-height scrolling container area (`85vh` / `720px`).
   - Image uploads are verified client-side for valid MIME types (PNG, JPEG, GIF, WEBP) and binary header magic bytes prior to encryption.

5. **Owner Channel Closure**:
   - Channel owners can leave or close their channel directly from their **Dashboard** or chat window without needing to re-type their 6-word channel key.
   - Closing a channel permanently deletes the record from PostgreSQL, wipes all historical ciphertexts, broadcasts `channel_closed` to connected devices, and purges device vaults.

---

## Security Model & User Privacy Guarantees

### 1. Entropy & Brute Force Immunity
- **12-Word Identity Phrase**: $2048^{12} = 2^{132} \approx 5.44 \times 10^{39}$ combinations (132-bit entropy). Brute forcing a user seed is mathematically impossible.
- **6-Word Channel Key**: $2048^6 = 2^{66} \approx 7.37 \times 10^{19}$ combinations (66-bit entropy). Offline dictionary attacks are mitigated by 100,000 PBKDF2 iterations; online probing is blocked by mandatory One-Time Invite PINs and Owner Join Approvals.

### 2. Impersonation Protection (ECDSA P-256 Signatures)
- Every device generates an **ECDSA (P-256)** digital signature over `(channelId + ciphertext + iv + deviceId)` for every message.
- Third parties cannot forge messages under another member's Device ID.

### 3. OTP Non-Reuse Security Hardening
- Even if a member gets kicked and creates a brand new 12-word identity (new `deviceId`), they CANNOT re-use the consumed OTP (`is_used = true`).
- Consumed OTPs are locked permanently in PostgreSQL and cannot be recycled or reactivated.

### 4. Malformed Upload Protection (Magic Byte Inspection)
- Prevents malicious file payload injection by verifying binary header magic bytes (`89 50 4E 47` for PNG, `FF D8 FF` for JPEG, `47 49 46` for GIF, `52 49 46 46` for WEBP) before encrypting and dispatching data.

---

## User Concerns & FAQ

#### Q: Can server administrators or database owners read my messages?
**No.** The server only receives AES-256-GCM ciphertexts and random initialization vectors (IVs). The decryption key is derived solely from the 6-word channel key in browser memory and is never sent to the server.

#### Q: Can someone guess my 6-word channel key and join?
**No.** Joining requires both the 6-word channel key AND a single-use invite PIN created by the channel owner. Additionally, the owner must approve every new join request before chat history or socket broadcasts are accessible.

#### Q: What happens if an owner loses their 6-word channel key?
Channel owners can click **Close** directly on their active channel card on the main Dashboard. Ownership is verified via their authenticated `deviceId`, allowing them to permanently delete the channel and wipe all server history without needing the 6-word channel key.

---

## High-Level API Reference

### REST Endpoints (`/api/channels`, `/api/profile`)
- `POST /api/channels/join`: Join/create channel (validates single-use invite PINs).
- `GET /api/channels/my-channels?deviceId=...`: Fetch list of active channels for a device.
- `GET /api/channels/:channelId/messages?deviceId=...`: Fetch encrypted chat history (Active members only).
- `GET /api/channels/:channelId/members?deviceId=...`: Fetch active members.
- `GET /api/channels/:channelId/pending-members?ownerDeviceId=...`: Fetch pending join requests (Owner only).
- `POST /api/channels/create-invite`: Generate a single-use invite PIN `INV-XXXXXX` (Owner only). Block reactivation of consumed PINs.
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

Application will run at `http://localhost:3000`.

---

## Automated Testing & Code Coverage (Jest & Supertest)

PrivChat includes a comprehensive **23-stage automated test suite** organized inside the `tests/` directory:

- **`tests/unit/crypto.test.js`**: Unit tests for SHA-256 hex hashing, string normalization, 12-word seed entropy math ($2^{132}$ combinations), and single-use invite code generation.
- **`tests/functional/channels.test.js`**: End-to-end functional tests for channel creation, invite code generation, active channels dashboard queries, owner pending queues, member approvals, kicking, and emergency dashboard closures.
- **`tests/security/access_control.test.js`**: Security penetration tests for single-use invite enforcement, consumed invite code rejection, history read blocking for pending/kicked users, non-owner route prohibition, owner channel deletion, profile persistence, and OTP reactivation blocking.

### Running Jest Tests & Code Coverage

```bash
# Execute Jest test suite and generate code coverage report
npm test
```

```bash
Test Suites: 3 passed, 3 total
Tests:       23 passed, 23 total
Snapshots:   0 total
Time:        2.088 s
```
