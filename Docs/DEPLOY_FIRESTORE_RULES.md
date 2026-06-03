# Deploy Firestore Rules - Quick Guide

> **⚠️ NOTICE: Student login functionality has been removed from this system.**
> 
> This document describes historical changes related to student portal accounts. Student authentication has been removed, and this functionality is no longer available.

## Historical Context (No Longer Applicable)

The Firestore security rules were previously updated to allow admins to create student portal accounts without permission errors. This functionality has since been removed as part of the student login removal feature.

## What Changed

**File**: `firestore.rules`

**Change**: Updated the `users` collection rules to allow admins to create and update user documents for students in their school, even when creating new accounts.

**Before**:
```javascript
allow update: if emailRoleConsistent(request.resource.data) && (
  isSuperAdmin() ||
  (isAdmin() && resource.data.get('schoolId', null) == userProfile().schoolId) ||
  ...
);
```

**After**:
```javascript
allow update: if emailRoleConsistent(request.resource.data) && (
  isSuperAdmin() ||
  (isAdmin() && 
   (resource.data.get('schoolId', null) == userProfile().schoolId ||
    request.resource.data.get('schoolId', null) == userProfile().schoolId)) ||
  ...
);
```

**Why**: When creating a new user document via `setDoc()`, there's no existing `resource.data` to check. The rule now also checks the incoming document's schoolId.

---

## Current Firestore Rules Deployment

To deploy the current Firestore rules (which no longer include student authentication):

### Option 1: Firebase CLI (Recommended)

```bash
# Make sure you're in the project root directory
cd /path/to/your/project

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Wait for confirmation message
# ✔  Deploy complete!
```

### Option 2: Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules** tab
4. Copy the contents of `firestore.rules` file
5. Paste into the editor
6. Click **Publish**

---

## Related Files

- `firestore.rules` - Security rules (updated to remove student authentication)
- `src/pages/StudentList.tsx` - Student directory (student login features removed)

---

**Last Updated**: 2026-05-20 (Updated to reflect student login removal)
