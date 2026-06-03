# AVENIR SIS — Google Ecosystem Integration Readiness Audit

**Audit Date:** May 21, 2026  
**System Version:** Current Production  
**Auditor:** Technical Architecture Review  
**Scope:** Complete system assessment for Google Workspace integration readiness

---

## EXECUTIVE SUMMARY

AVENIR SIS is a **multi-tenant School Information System** built on Firebase (Firestore, Auth, Functions, Storage) with a React frontend. The system demonstrates **strong foundational architecture** but requires **significant preparation** before Google Workspace integration.

**Overall Readiness: 52/100** (Moderate - Requires Substantial Work)

**Key Findings:**
- ✅ Solid Firebase foundation with proper multi-tenancy
- ✅ Existing Google Sign-In infrastructure (partial)
- ⚠️ No OAuth token management or refresh flow
- ⚠️ No service layer abstraction for external APIs
- ⚠️ File storage uses Cloudinary, not Firebase Storage
- ❌ No webhook handling infrastructure
- ❌ No background job/queue system
- ❌ Assignment system exists but lacks submission tracking

---

## 1. EXISTING ARCHITECTURE SUMMARY

### Technology Stack
```
Frontend:  React 19 + TypeScript + Vite
Backend:   Firebase Functions (TypeScript)
Database:  Firestore (multi-tenant via schoolId field)
Auth:      Firebase Authentication
Storage:   Cloudinary (unsigned uploads)
AI:        Google Gemini API (already integrated)
Styling:   Tailwind CSS + Motion (Framer Motion)
```

### Multi-Tenancy Model
- **Pattern:** Shared collections with `schoolId` field-based isolation
- **Enforcement:** Dual-layer (Firestore Security Rules + Application queries)
- **Super Admin:** Platform-level role with school-switching capability
- **Status:** ✅ **Fully audited and hardened** (April 2026)

### Current Firebase Services
| Service | Usage | Status |
|---------|-------|--------|
| **Authentication** | Email/password + Google Sign-In (partial) | ✅ Active |
| **Firestore** | Primary database with 40+ collections | ✅ Active |
| **Functions** | 1 callable function (password reset) | ⚠️ Minimal |
| **Storage** | NOT USED (Cloudinary instead) | ❌ Not configured |
| **Messaging** | FCM for push notifications | ✅ Active |
| **Hosting** | Static site deployment | ✅ Active |

---

## 2. CURRENT FEATURES COMPATIBLE WITH GOOGLE INTEGRATION

### ✅ Already Compatible

#### Authentication Infrastructure
- **Google Sign-In Provider:** Configured in `FirebaseProvider.tsx`
  ```typescript
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
  ```
- **Status:** Basic Google OAuth login works
- **Limitation:** Only captures email/displayName, no access tokens stored

#### AI Integration (Google Gemini)
- **Service:** `src/services/geminiService.ts`
- **Features:** Lesson notes, exam questions, grading comments, student insights
- **API Key:** Environment variable `GEMINI_API_KEY`
- **Status:** ✅ **Fully operational**

#### Calendar/Event System
- **Collection:** `events` (Firestore)
- **Fields:** `title`, `description`, `date`, `type`, `schoolId`
- **UI:** `SchoolCalendar.tsx` with month view
- **Status:** ✅ Basic calendar exists, ready for sync

#### Timetable System
- **Collection:** `timetables` (Firestore)
- **Structure:** Weekly schedule per class/term with periods
- **Conflict Detection:** Teacher double-booking prevention
- **Status:** ✅ Structured data, ready for Google Calendar sync

#### Assignment System (Partial)
- **Collection:** `assignments` (Firestore)
- **Fields:** `title`, `description`, `subject`, `class`, `dueDate`, `teacherId`
- **Status:** ⚠️ **Exists but incomplete** (no submissions, no file attachments)

#### Notification System
- **Collections:** `notifications`, `notification_broadcasts`
- **Channels:** In-app, FCM push, WhatsApp (manual)
- **Status:** ✅ Infrastructure exists, needs email integration

---

## 3. MISSING COMPONENTS REQUIRED BEFORE INTEGRATION

### ❌ Critical Missing Infrastructure

#### 1. OAuth Token Management
**Current State:** NOT FOUND IN CODEBASE  
**Required For:** Drive API, Classroom API, Calendar API, Gmail API

**What's Missing:**
- No `accessToken` storage in user profiles
- No `refreshToken` persistence
- No token refresh logic
- No OAuth scope request flow

**Impact:** Cannot make authenticated API calls to Google services

**Recommendation:**
```typescript
// Required additions to UserProfile type
interface UserProfile {
  // ... existing fields
  googleTokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scope: string[];
  };
}
```

#### 2. Service Layer Abstraction
**Current State:** Direct Firestore calls throughout codebase  
**Required For:** External API integration, retry logic, rate limiting

**What's Missing:**
- No centralized HTTP client
- No API request/response interceptors
- No retry/backoff logic
- No rate limit handling
- No request queuing

**Impact:** Cannot reliably integrate with Google APIs

**Recommendation:** Create `src/services/googleApiService.ts` with:
- Token refresh middleware
- Exponential backoff retry
- Rate limit detection
- Request queuing for batch operations

#### 3. Webhook Handler Infrastructure
**Current State:** NOT FOUND  
**Required For:** Google Calendar push notifications, Drive file changes

**What's Missing:**
- No webhook endpoint in Firebase Functions
- No signature verification
- No event processing queue
- No idempotency handling

**Impact:** Cannot receive real-time updates from Google services

**Recommendation:**
```typescript
// functions/src/index.ts
export const googleWebhook = onRequest(async (req, res) => {
  // Verify Google signature
  // Parse notification
  // Queue for processing
  // Return 200 OK immediately
});
```

#### 4. Background Job System
**Current State:** NOT FOUND  
**Required For:** Async sync operations, batch imports, scheduled tasks

**What's Missing:**
- No job queue (Firestore-based or Cloud Tasks)
- No worker functions
- No job status tracking
- No retry/failure handling

**Impact:** Cannot perform long-running sync operations

**Recommendation:** Use Firestore-based queue pattern:
```
/sync_jobs/{jobId}
  status: 'pending' | 'processing' | 'completed' | 'failed'
  type: 'calendar_sync' | 'drive_import' | 'classroom_sync'
  schoolId: string
  createdAt: timestamp
  processedAt: timestamp
```

#### 5. File Storage Migration Path
**Current State:** Cloudinary (unsigned uploads)  
**Required For:** Google Drive integration

**What's Missing:**
- No Firebase Storage configuration
- No file metadata in Firestore
- No file provider abstraction

**Impact:** Cannot integrate Drive as alternative storage

**Recommendation:** Create storage abstraction:
```typescript
interface FileProvider {
  upload(file: File): Promise<string>;
  delete(url: string): Promise<void>;
  getMetadata(url: string): Promise<FileMetadata>;
}

class CloudinaryProvider implements FileProvider { ... }
class DriveProvider implements FileProvider { ... }
```

---

## 4. AUTHENTICATION READINESS SCORE: 45/100

### ✅ Strengths
- Firebase Auth configured and operational
- Google Sign-In provider enabled
- Multi-tenant user profiles with `schoolId`
- Role-based access control (RBAC) implemented
- Session persistence working

### ⚠️ Weaknesses
- **No OAuth scope management:** Only basic profile scopes requested
- **No token storage:** Access tokens not persisted
- **No refresh flow:** Tokens expire after 1 hour, no renewal
- **No consent screen:** Users not prompted for Drive/Calendar/Classroom permissions
- **No account linking:** Cannot link existing email/password accounts to Google

### 🔧 Required Changes

#### Priority 1: Token Persistence
```typescript
// After successful Google Sign-In
const credential = GoogleAuthProvider.credentialFromResult(result);
const accessToken = credential?.accessToken;
const idToken = credential?.idToken;

// Store in Firestore
await updateDoc(doc(db, 'users', user.uid), {
  googleTokens: {
    accessToken,
    refreshToken: result.user.refreshToken, // May not be available
    expiresAt: Date.now() + 3600000,
    scope: ['email', 'profile'], // Expand as needed
  }
});
```

#### Priority 2: Scope Request
```typescript
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar');
provider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
```

#### Priority 3: Token Refresh
```typescript
// functions/src/index.ts
export const refreshGoogleToken = onCall(async (request) => {
  const { refreshToken } = request.data;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const { access_token, expires_in } = await response.json();
  return { accessToken: access_token, expiresIn: expires_in };
});
```

---

## 5. DATABASE READINESS SCORE: 70/100

### ✅ Strengths
- **Multi-tenant architecture:** All collections properly scoped with `schoolId`
- **Security rules:** Comprehensive Firestore rules enforce isolation
- **Flexible schema:** Document-based structure allows easy field additions
- **Existing metadata:** Most entities have `createdAt`, `updatedAt` timestamps
- **Audit trail:** `audit_log` collection for change tracking

### ⚠️ Weaknesses
- **No external reference fields:** No `googleDriveFileId`, `googleCalendarEventId`, etc.
- **No sync status tracking:** No way to know if entity is synced to Google
- **No conflict resolution:** No `lastSyncedAt` or version fields
- **File metadata incomplete:** Cloudinary URLs stored as strings, no structured metadata

### 🔧 Required Schema Extensions

#### Add Integration Metadata to Key Collections

**Students:**
```typescript
interface Student {
  // ... existing fields
  googleIntegration?: {
    driveFolder
Id?: string;
    classroomStudentId?: string;
    lastSyncedAt?: Timestamp;
  };
}
```

**Assignments:**
```typescript
interface Assignment {
  // ... existing fields
  googleClassroomId?: string;
  googleDriveAttachments?: {
    fileId: string;
    fileName: string;
    mimeType: string;
    webViewLink: string;
  }[];
  submissions?: {
    studentId: string;
    submittedAt?: Timestamp;
    googleDriveFileId?: string;
    status: 'pending' | 'submitted' | 'graded';
    grade?: number;
  }[];
  syncStatus?: 'pending' | 'synced' | 'error';
  lastSyncedAt?: Timestamp;
}
```

**Events:**
```typescript
interface SchoolEvent {
  // ... existing fields
  googleCalendarEventId?: string;
  googleMeetLink?: string;
  syncStatus?: 'pending' | 'synced' | 'error';
  lastSyncedAt?: Timestamp;
}
```

**Timetables:**
```typescript
interface Timetable {
  // ... existing fields
  googleCalendarIds?: {
    [day: string]: string; // Map day to Google Calendar event ID
  };
  syncStatus?: 'pending' | 'synced' | 'error';
  lastSyncedAt?: Timestamp;
}
```

#### New Collections Needed

**Sync Jobs:**
```typescript
interface SyncJob {
  id: string;
  schoolId: string;
  type: 'calendar_sync' | 'drive_sync' | 'classroom_sync';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  entityType: 'assignment' | 'event' | 'timetable';
  entityId: string;
  direction: 'to_google' | 'from_google' | 'bidirectional';
  error?: string;
  retryCount: number;
  createdAt: Timestamp;
  processedAt?: Timestamp;
}
```

**Google Credentials (per school):**
```typescript
interface GoogleCredentials {
  id: string; // schoolId
  serviceAccountEmail?: string;
  delegatedAdminEmail?: string;
  calendarId?: string; // School's primary calendar
  driveRootFolderId?: string;
  classroomCourseIds?: string[];
  enabledServices: ('drive' | 'calendar' | 'classroom' | 'meet' | 'gmail')[];
  lastVerifiedAt?: Timestamp;
}
```

---

## 6. API ARCHITECTURE READINESS SCORE: 30/100

### ✅ Strengths
- **Firebase Functions:** Infrastructure exists (1 callable function)
- **Gemini AI Service:** Demonstrates external API integration pattern
- **Error Handling:** `handleFirestoreError` utility for consistent error logging
- **Environment Variables:** `.env` pattern established

### ❌ Critical Gaps

#### No HTTP Client Abstraction
**Current:** Direct `fetch()` calls in `geminiService.ts`  
**Problem:** No retry logic, no rate limiting, no token refresh

**Required:**
```typescript
// src/services/httpClient.ts
class GoogleApiClient {
  private baseUrl = 'https://www.googleapis.com/';
  
  async request<T>(
    endpoint: string,
    options: RequestInit,
    retries = 3
  ): Promise<T> {
    const token = await this.getValidToken();
    const response = await fetch(this.baseUrl + endpoint, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (response.status === 401) {
      await this.refreshToken();
      return this.request(endpoint, options, retries - 1);
    }
    
    if (response.status === 429 && retries > 0) {
      await this.backoff(retries);
      return this.request(endpoint, options, retries - 1);
    }
    
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  }
  
  private async getValidToken(): Promise<string> { /* ... */ }
  private async refreshToken(): Promise<void> { /* ... */ }
  private async backoff(retries: number): Promise<void> { /* ... */ }
}
```

#### No Middleware Architecture
**Current:** No request/response interceptors  
**Problem:** Cannot inject auth, logging, or error handling globally

**Required:**
- Request interceptor for token injection
- Response interceptor for error normalization
- Logging interceptor for audit trail

#### No Queue System
**Current:** All operations synchronous  
**Problem:** Long-running syncs will timeout

**Required:** Firestore-based job queue with Cloud Functions worker

#### No Webhook Endpoint
**Current:** No Functions endpoint for incoming webhooks  
**Problem:** Cannot receive Google Calendar/Drive notifications

**Required:**
```typescript
// functions/src/webhooks.ts
export const googleCalendarWebhook = onRequest(async (req, res) => {
  // Verify X-Goog-Channel-Token
  // Parse notification
  // Queue sync job
  res.status(200).send('OK');
});
```

---

## 7. ASSIGNMENT SYSTEM READINESS SCORE: 40/100

### ✅ Exists
- **Collection:** `assignments` in Firestore
- **Fields:** `title`, `description`, `subject`, `class`, `dueDate`, `teacherId`, `schoolId`
- **UI:** Teacher portal has assignment creation form

### ❌ Missing for Google Classroom Integration

#### No Submission Tracking
**Current:** Assignments are announcements only  
**Required:**
```typescript
interface Assignment {
  // ... existing
  submissions: {
    studentId: string;
    submittedAt?: Timestamp;
    files?: { name: string; url: string; googleDriveFileId?: string }[];
    status: 'pending' | 'submitted' | 'late' | 'graded';
    grade?: number;
    feedback?: string;
  }[];
}
```

#### No File Attachments
**Current:** No file upload on assignments  
**Required:** Drive API integration for teacher attachments

#### No Grading Workflow
**Current:** Grades stored separately in `grades` collection  
**Required:** Link assignment submissions to gradebook

#### No Student View
**Current:** Students cannot see or submit assignments (student login removed)  
**Required:** Parent portal assignment view + submission on behalf of student

---

## 8. FILE MANAGEMENT READINESS SCORE: 25/100

### ⚠️ Current State: Cloudinary Only

**Configuration:**
- Cloud Name: Stored in `school_settings/{schoolId}.cloudinaryCloudName`
- Upload Preset: Stored in `school_settings/{schoolId}.cloudinaryUploadPreset`
- Upload Function: `src/utils/cloudinaryUpload.ts`

**Usage:**
- Student photos (`Student.photoUrl`)
- School logos (`SchoolSettings.logoUrl`)
- No other file types currently uploaded

### ❌ Firebase Storage NOT CONFIGURED

**Evidence:**
```typescript
// src/firebase.ts
export const auth = getAuth(app);
export const db = getFirestore(app);
// NO: export const storage = getStorage(app);
```

**Search Results:** No `uploadBytes`, `getDownloadURL`, or `ref(storage` found in codebase

### 🔧 Required for Google Drive Integration

#### 1. Storage Abstraction Layer
```typescript
// src/services/storageService.ts
interface StorageProvider {
  upload(file: File, path: string): Promise<FileMetadata>;
  delete(fileId: string): Promise<void>;
  getUrl(fileId: string): Promise<string>;
  list(path: string): Promise<FileMetadata[]>;
}

class CloudinaryProvider implements StorageProvider { /* existing */ }
class GoogleDriveProvider implements StorageProvider { /* new */ }
class FirebaseStorageProvider implements StorageProvider { /* new */ }

// Factory pattern
function getStorageProvider(schoolId: string): StorageProvider {
  const settings = await getSchoolSettings(schoolId);
  switch (settings.storageProvider) {
    case 'drive': return new GoogleDriveProvider();
    case 'firebase': return new FirebaseStorageProvider();
    default: return new CloudinaryProvider();
  }
}
```

#### 2. File Metadata Collection
```typescript
interface FileMetadata {
  id: string;
  schoolId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Timestamp;
  provider: 'cloudinary' | 'firebase' | 'drive';
  providerFileId: string;
  url: string;
  parentFolder?: string;
  tags?: string[];
  linkedEntity?: {
    type: 'student' | 'assignment' | 'event';
    id: string;
  };
}
```

#### 3. Drive Folder Structure
```
School Root Folder (per school)
├── Students/
│   ├── {studentId}/
│   │   ├── Profile Photo
│   │   ├── Documents/
│   │   └── Assignments/
├── Assignments/
│   └── {assignmentId}/
│       ├── Instructions.pdf
│       └── Submissions/
│           └── {studentId}_submission.pdf
├── Reports/
└── Admin/
```

---

## 9. CALENDAR/TIMETABLE READINESS SCORE: 65/100

### ✅ Strong Foundation

**Events Collection:**
- Fields: `title`, `description`, `date`, `type`, `schoolId`
- UI: Month view calendar with CRUD operations
- Multi-tenant: Properly scoped

**Timetable Collection:**
- Weekly schedule structure
- Teacher assignment
- Conflict detection
- Period times configurable per school

### ⚠️ Gaps for Google Calendar Sync

#### No Recurring Event Support
**Current:** Single-date events only  
**Required:** Timetable periods need to sync as recurring events

**Solution:**
```typescript
interface SchoolEvent {
  // ... existing
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[]; // 0=Sunday, 6=Saturday
    endDate?: string;
    count?: number;
  };
}
```

#### No Time Zone Handling
**Current:** Dates stored as strings (YYYY-MM-DD)  
**Required:** ISO 8601 timestamps with timezone

**Solution:**
```typescript
// Use school's timezone from school_settings
const timezone = schoolSettings.timezone || 'Africa/Lagos';
const startDateTime = moment.tz(`${date} ${startTime}`, timezone).toISOString();
```

#### No Attendee Management
**Current:** Events have no participant list  
**Required:** Link events to classes/students for Calendar invites

**Solution:**
```typescript
interface SchoolEvent {
  // ... existing
  attendees?: {
    type: 'class' | 'student' | 'teacher' | 'parent';
    id: string;
    email?: string;
    responseStatus?: 'needsAction' | 'accepted' | 'declined';
  }[];
}
```

---

## 10. SECURITY & SCALABILITY CONCERNS

### 🔒 Security Audit

#### ✅ Strengths
- **Firestore Rules:** Comprehensive, multi-tenant enforcement
- **Role-Based Access:** 9 roles with granular permissions
- **Audit Logging:** `audit_log` collection tracks changes
- **Super Admin Guard:** Reserved emails cannot be misused
- **Input Validation:** Client-side validation on forms

#### ⚠️ Risks for Google Integration

**1. Token Storage in Firestore**
- **Risk:** Access tokens in plaintext
- **Mitigation:** Encrypt tokens at rest using Cloud KMS
- **Priority:** HIGH

**2. No Rate Limiting**
- **Risk:** Abuse of Google API quotas
- **Mitigation:** Implement per-school rate limits
- **Priority:** MEDIUM

**3. Webhook Signature Verification**
- **Risk:** Spoofed webhook calls
- **Mitigation:** Verify `X-Goog-Channel-Token` and `X-Goog-Resource-State`
- **Priority:** HIGH

**4. Service Account Key Management**
- **Risk:** Keys in environment variables
- **Mitigation:** Use Secret Manager, rotate keys quarterly
- **Priority:** HIGH

**5. OAuth Consent Screen**
- **Risk:** Users grant excessive permissions
- **Mitigation:** Request minimum scopes, explain each permission
- **Priority:** MEDIUM

### 📈 Scalability Concerns

#### Current Limits
- **Firestore:** 1 write/second per document (not a concern yet)
- **Functions:** 1000 concurrent executions (free tier)
- **Google API Quotas:**
  - Drive: 1000 requests/100 seconds/user
  - Calendar: 1,000,000 queries/day
  - Classroom: 1500 requests/minute

#### Bottlenecks for Integration

**1. Sync Operations**
- **Problem:** Syncing 500 students × 10 assignments = 5000 API calls
- **Solution:** Batch API requests, use exponential backoff
- **Priority:** HIGH

**2. Webhook Processing**
- **Problem:** Burst of notifications can overwhelm Functions
- **Solution:** Queue webhooks in Firestore, process with rate limiting
- **Priority:** MEDIUM

**3. Token Refresh**
- **Problem:** 100 concurrent users refreshing tokens
- **Solution:** Cache tokens in memory, refresh proactively before expiry
- **Priority:** MEDIUM

---

## 11. TECHNICAL DEBT & REFACTOR RECOMMENDATIONS

### 🔴 HIGH PRIORITY (Must Fix Before Integration)

#### 1. Implement OAuth Token Management
**Effort:** 2-3 weeks  
**Files:**
- `src/components/FirebaseProvider.tsx` (add token storage)
- `functions/src/auth.ts` (token refresh endpoint)
- `src/services/googleApiService.ts` (new file)

**Tasks:**
- Store `accessToken`, `refreshToken`, `expiresAt` in user profile
- Create Cloud Function for token refresh
- Implement token refresh middleware
- Add OAuth scope selection UI

#### 2. Create Service Layer Abstraction
**Effort:** 1-2 weeks  
**Files:**
- `src/services/httpClient.ts` (new file)
- `src/services/googleDriveService.ts` (new file)
- `src/services/googleCalendarService.ts` (new file)
- `src/services/googleClassroomService.ts` (new file)

**Tasks:**
- Build HTTP client with retry/backoff
- Implement rate limiting
- Add request/response logging
- Create service interfaces for each Google API

#### 3. Build Webhook Handler
**Effort:** 1 week  
**Files:**
- `functions/src/webhooks.ts` (new file)
- `functions/src/syncProcessor.ts` (new file)

**Tasks:**
- Create webhook endpoint
- Implement signature verification
- Queue notifications in Firestore
- Build worker function to process queue

#### 4. Extend Database Schema
**Effort:** 1 week  
**Files:**
- `src/types.ts` (add integration fields)
- Firestore migration script

**Tasks:**
- Add `googleIntegration` fields to Student, Assignment, Event
- Create `sync_jobs` collection
- Create `google_credentials` collection
- Write migration to backfill existing data

### 🟡 MEDIUM PRIORITY (Recommended Before Launch)

#### 5. Assignment Submission System
**Effort:** 2 weeks  
**Files:**
- `src/pages/TeacherPortal.tsx` (add submission view)
- `src/pages/ParentPortal.tsx` (add submission form)
- `src/types.ts` (extend Assignment interface)

**Tasks:**
- Add `submissions` array to Assignment
- Build submission UI for parents
- Link submissions to gradebook
- Support file attachments via Drive

#### 6. Storage Provider Abstraction
**Effort:** 1 week  
**Files:**
- `src/services/storageService.ts` (new file)
- `src/utils/cloudinaryUpload.ts` (refactor)

**Tasks:**
- Create `StorageProvider` interface
- Implement `GoogleDriveProvider`
- Implement `FirebaseStorageProvider`
- Add provider selection in school settings

#### 7. Background Job System
**Effort:** 1-2 weeks  
**Files:**
- `functions/src/jobQueue.ts` (new file)
- `functions/src/workers/` (new directory)

**Tasks:**
- Implement Firestore-based queue
- Create worker functions for each job type
- Add job status tracking UI
- Implement retry/failure handling

### 🟢 LOW PRIORITY (Nice to Have)

#### 8. Conflict Resolution UI
**Effort:** 1 week  
**Tasks:**
- Detect sync conflicts (local vs Google changes)
- Show diff UI to admin
- Allow manual conflict resolution

#### 9. Bulk Import from Google Classroom
**Effort:** 1 week  
**Tasks:**
- Fetch existing Classroom courses
- Map to AVENIR classes
- Import students and assignments

#### 10. Google Meet Integration
**Effort:** 3-5 days  
**Tasks:**
- Generate Meet links for events
- Embed Meet in timetable periods
- Track attendance via Meet API

---

## 12. RECOMMENDED INTEGRATION ORDER

### Phase 1: Foundation (4-6 weeks)
**Goal:** Establish core integration infrastructure

1. **Week 1-2:** OAuth Token Management
   - Implement token storage
   - Build refresh endpoint
   - Add scope selection UI

2. **Week 3-4:** Service Layer
   - Create HTTP client
   - Build Drive/Calendar/Classroom services
   - Implement retry/rate limiting

3. **Week 5-6:** Database Schema
   - Extend types with integration fields
   - Create sync_jobs collection
   - Write migration scripts

**Deliverable:** System can authenticate with Google APIs and make basic requests

### Phase 2: Google Drive (3-4 weeks)
**Goal:** Replace/augment Cloudinary with Drive

1. **Week 1:** Storage Abstraction
   - Build StorageProvider interface
   - Implement GoogleDriveProvider
   - Add provider selection

2. **Week 2:** File Metadata
   - Create files collection
   - Track uploads in Firestore
   - Build folder structure

3. **Week 3-4:** UI Integration
   - Update upload flows
   - Add Drive file picker
   - Migrate existing Cloudinary files (optional)

**Deliverable:** Schools can choose Drive as storage provider

### Phase 3: Google Calendar (3-4 weeks)
**Goal:** Sync events and timetables

1. **Week 1:** Event Sync
   - Build Calendar API service
   - Sync SchoolEvent → Calendar Event
   - Handle recurring events

2. **Week 2:** Timetable Sync
   - Convert timetable periods to recurring events
   - Sync teacher assignments
   - Handle conflicts

3. **Week 3:** Webhook Handler
   - Build webhook endpoint
   - Process Calendar notifications
   - Update Firestore on changes

4. **Week 4:** UI Polish
   - Show sync status
   - Add "View in Google Calendar" links
   - Handle errors gracefully

**Deliverable:** School calendar syncs bidirectionally with Google Calendar

### Phase 4: Google Classroom (4-6 weeks)
**Goal:** Sync assignments and grades

1. **Week 1-2:** Assignment Submission System
   - Extend Assignment schema
   - Build submission UI
   - Link to gradebook

2. **Week 3-4:** Classroom API Integration
   - Create courses from classes
   - Sync assignments
   - Sync student roster

3. **Week 5:** Grade Sync
   - Push grades to Classroom
   - Handle grade updates
   - Resolve conflicts

4. **Week 6:** Testing & Polish
   - End-to-end testing
   - Error handling
   - Documentation

**Deliverable:** Teachers can manage assignments in AVENIR or Classroom interchangeably

### Phase 5: Gmail Integration (2-3 weeks)
**Goal:** Send emails via Gmail API

1. **Week 1:** Email Service
   - Build Gmail API service
   - Replace notification system
   - Add email templates

2. **Week 2-3:** Transactional Emails
   - Fee reminders
   - Attendance alerts
   - Exam notifications

**Deliverable:** All notifications sent via school's Gmail account

---

## APPENDIX A: GOOGLE API QUOTA LIMITS

| API | Quota | Per | Notes |
|-----|-------|-----|-------|
| **Drive API** | 1,000 requests | 100 seconds/user | Batch requests count as 1 |
| **Calendar API** | 1,000,000 queries | day | 5 requests/second/user |
| **Classroom API** | 1,500 requests | minute | 50 requests/second/user |
| **Gmail API** | 1,000,000,000 quota units | day | 1 send = 100 units |
| **People API** | 600 requests | minute/user | For contact sync |

**Mitigation Strategies:**
- Batch API requests (Drive supports 100 requests/batch)
- Cache responses (Calendar events, Drive file lists)
- Use exponential backoff on 429 errors
- Implement per-school rate limiting

---

## APPENDIX B: ESTIMATED DEVELOPMENT TIMELINE

| Phase | Duration | Team Size | Effort (person-weeks) |
|-------|----------|-----------|----------------------|
| **Phase 1: Foundation** | 6 weeks | 2 developers | 12 weeks |
| **Phase 2: Drive** | 4 weeks | 2 developers | 8 weeks |
| **Phase 3: Calendar** | 4 weeks | 2 developers | 8 weeks |
| **Phase 4: Classroom** | 6 weeks | 2 developers | 12 weeks |
| **Phase 5: Gmail** | 3 weeks | 1 developer | 3 weeks |
| **Testing & QA** | 2 weeks | 2 developers | 4 weeks |
| **Documentation** | 1 week | 1 developer | 1 week |
| **TOTAL** | **26 weeks** | **2 developers** | **48 person-weeks** |

**Assumptions:**
- Developers familiar with Firebase and Google APIs
- No major architectural changes required
- Existing codebase is stable
- QA team available for testing

---

## APPENDIX C: COST ESTIMATE

### Google Workspace Costs (per school)
- **Workspace for Education Fundamentals:** FREE
- **Workspace for Education Standard:** $3/student/year
- **Workspace for Education Plus:** $5/student/year

### Firebase Costs (platform-wide)
- **Firestore:** ~$0.06/100k reads, $0.18/100k writes
- **Functions:** $0.40/million invocations
- **Storage:** $0.026/GB/month
- **Bandwidth:** $0.12/GB

### Estimated Monthly Cost (100 schools, 50k students)
- **Google Workspace:** $0 (Fundamentals) or $12,500/month (Standard)
- **Firebase:** ~$500-1000/month (depends on sync frequency)
- **Total:** $500-13,500/month

---

## CONCLUSION

AVENIR SIS has a **solid foundation** for Google integration but requires **significant infrastructure work** before launch. The system's multi-tenant architecture, Firebase foundation, and existing AI integration demonstrate technical maturity, but critical gaps in OAuth management, service layer abstraction, and webhook handling must be addressed.

**Recommended Next Steps:**
1. **Immediate:** Implement OAuth token management (Phase 1, Week 1-2)
2. **Short-term:** Build service layer abstraction (Phase 1, Week 3-4)
3. **Medium-term:** Extend database schema (Phase 1, Week 5-6)
4. **Long-term:** Follow phased integration plan (Phases 2-5)

**Timeline:** 26 weeks (6 months) for full integration  
**Effort:** 48 person-weeks (2 developers full-time)  
**Risk Level:** MEDIUM (manageable with proper planning)

---

**Report Prepared By:** Technical Architecture Team  
**Date:** May 21, 2026  
**Version:** 1.0  
**Classification:** Internal Use Only
