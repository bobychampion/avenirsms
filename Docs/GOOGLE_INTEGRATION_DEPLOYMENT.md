# Google Workspace Integration Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Google Workspace Integration Foundation Layer to Firebase. This deployment enables schools to connect their own Google Workspace accounts to AVENIR for future synchronization features.

**Prerequisites:**
- Completed Google Cloud Console setup (see [GOOGLE_INTEGRATION_SETUP.md](./GOOGLE_INTEGRATION_SETUP.md))
- Firebase CLI installed and authenticated
- Node.js 20+ installed
- Access to Firebase project with appropriate permissions

---

## Table of Contents

1. [Firebase Project Setup](#1-firebase-project-setup)
2. [Environment Variable Configuration](#2-environment-variable-configuration)
3. [Cloud Functions Deployment](#3-cloud-functions-deployment)
4. [Firestore Rules Deployment](#4-firestore-rules-deployment)
5. [Firestore Indexes Deployment](#5-firestore-indexes-deployment)
6. [Frontend Deployment](#6-frontend-deployment)
7. [Post-Deployment Verification](#7-post-deployment-verification)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)

---

## 1. Firebase Project Setup

### 1.1 Verify Firebase Project

Ensure you're working with the correct Firebase project:

```bash
# Check current Firebase project
firebase projects:list

# Select the correct project
firebase use <project-id>

# Verify selection
firebase projects:list
```

### 1.2 Verify Firebase Configuration

Check that your `.firebaserc` file contains the correct project:

```bash
cat .firebaserc
```

Expected output:
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

### 1.3 Verify Firebase Services

Ensure required Firebase services are enabled:

```bash
# Check Firebase configuration
cat firebase.json
```

Verify the following sections exist:
- `hosting` - Frontend deployment
- `firestore` - Database rules and indexes
- `functions` - Cloud Functions (if configured)

---

## 2. Environment Variable Configuration

### 2.1 Prepare Environment Variables

Create or update your environment variable files with Google OAuth credentials obtained from Google Cloud Console.

#### Backend Environment Variables (Cloud Functions)

**Option A: Using Firebase Functions Config (Recommended)**

```bash
# Set Google OAuth credentials
firebase functions:config:set \
  google.client_id="YOUR_CLIENT_ID.apps.googleusercontent.com" \
  google.client_secret="YOUR_CLIENT_SECRET" \
  google.redirect_uri="https://your-domain.com/api/google/callback"

# Verify configuration
firebase functions:config:get
```

Expected output:
```json
{
  "google": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uri": "https://your-domain.com/api/google/callback"
  }
}
```

**Option B: Using .env File (Development Only)**

Create `functions/.env`:

```bash
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/callback
```

**⚠️ Security Warning:** Never commit `.env` files to version control. Ensure `.env` is in `.gitignore`.

#### Frontend Environment Variables

Create or update `.env` in the project root:

```bash
# Frontend-accessible Google Client ID
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/callback
```

### 2.2 Validate Environment Variables

**Backend Validation:**

```bash
# Check if functions config is set
firebase functions:config:get google
```

**Frontend Validation:**

```bash
# Check if .env file exists and contains required variables
grep VITE_GOOGLE .env
```

Expected output:
```
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/callback
```

### 2.3 Environment Variable Checklist

Before proceeding, verify:

- [ ] `GOOGLE_CLIENT_ID` is set (backend)
- [ ] `GOOGLE_CLIENT_SECRET` is set (backend)
- [ ] `GOOGLE_REDIRECT_URI` is set (backend)
- [ ] `VITE_GOOGLE_CLIENT_ID` is set (frontend)
- [ ] `VITE_GOOGLE_REDIRECT_URI` is set (frontend)
- [ ] Redirect URI matches the authorized redirect URI in Google Cloud Console
- [ ] `.env` files are in `.gitignore`

---

## 3. Cloud Functions Deployment

### 3.1 Install Dependencies

Navigate to the functions directory and install dependencies:

```bash
cd functions
npm install
```

### 3.2 Build TypeScript

Compile TypeScript to JavaScript:

```bash
npm run build
```

Expected output:
```
> functions@1.0.0 build
> tsc

# No errors should appear
```

Verify the build output:

```bash
ls -la lib/
```

You should see compiled JavaScript files:
- `lib/index.js`
- `lib/google/googleAuthService.js`
- `lib/google/googleTokenService.js`
- `lib/google/googleVerificationService.js`
- And other service files

### 3.3 Deploy Cloud Functions

Deploy the Google integration Cloud Functions:

```bash
# Deploy all Google integration functions
firebase deploy --only functions:connectGoogleWorkspace,functions:refreshGoogleToken,functions:disconnectGoogleWorkspace,functions:verifyGoogleConnection
```

**Alternative: Deploy all functions**

```bash
# Deploy all Cloud Functions (if you have other functions)
firebase deploy --only functions
```

### 3.4 Verify Cloud Functions Deployment

Check the deployment status:

```bash
# List deployed functions
firebase functions:list
```

Expected output should include:
```
┌──────────────────────────────────┬────────────────────────────────────┐
│ Function Name                    │ Status                             │
├──────────────────────────────────┼────────────────────────────────────┤
│ connectGoogleWorkspace           │ ACTIVE                             │
│ refreshGoogleToken               │ ACTIVE                             │
│ disconnectGoogleWorkspace        │ ACTIVE                             │
│ verifyGoogleConnection           │ ACTIVE                             │
└──────────────────────────────────┴────────────────────────────────────┘
```

### 3.5 Test Cloud Functions

Test that functions are callable:

```bash
# Check function logs
firebase functions:log --only connectGoogleWorkspace --limit 5
```

### 3.6 Cloud Functions Deployment Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript compiled successfully (`npm run build`)
- [ ] All four Google integration functions deployed
- [ ] Functions show "ACTIVE" status
- [ ] No deployment errors in logs

---

## 4. Firestore Rules Deployment

### 4.1 Review Firestore Rules

Verify that `firestore.rules` includes Google integration security rules:

```bash
# Check if Google integration rules exist
grep -A 10 "schools/{schoolId}/integrations/google" firestore.rules
```

Expected rules should include:
- Read access for school admins only
- Write access for school admins only
- Super admin read access
- Token protection rules

### 4.2 Validate Firestore Rules

Test rules syntax before deployment:

```bash
# Validate rules syntax (requires Firebase Emulator)
firebase emulators:start --only firestore --inspect-functions
```

Press `Ctrl+C` to stop after validation.

### 4.3 Deploy Firestore Rules

Deploy the security rules:

```bash
firebase deploy --only firestore:rules
```

Expected output:
```
=== Deploying to 'your-project-id'...

i  deploying firestore
i  firestore: checking firestore.rules for compilation errors...
✔  firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!
```

### 4.4 Verify Firestore Rules Deployment

Check the deployed rules in Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules**
4. Verify the rules were updated (check the timestamp)

### 4.5 Test Firestore Rules

Test that rules are enforced correctly:

**Test 1: School admin can read their integration document**
```javascript
// In browser console (as school admin)
const db = firebase.firestore();
const schoolId = 'your-school-id';
const docRef = db.doc(`schools/${schoolId}/integrations/google`);
docRef.get().then(doc => console.log('Success:', doc.exists));
```

**Test 2: Non-admin cannot read integration document**
```javascript
// In browser console (as non-admin user)
const db = firebase.firestore();
const schoolId = 'another-school-id';
const docRef = db.doc(`schools/${schoolId}/integrations/google`);
docRef.get().catch(err => console.log('Expected error:', err.code));
// Should log: "Expected error: permission-denied"
```

### 4.6 Firestore Rules Deployment Checklist

- [ ] Rules file syntax is valid
- [ ] Rules deployed successfully
- [ ] Rules timestamp updated in Firebase Console
- [ ] School admin can read their integration document
- [ ] Non-admin users cannot read integration documents
- [ ] Cross-school access is blocked

---

## 5. Firestore Indexes Deployment

### 5.1 Review Firestore Indexes

Check that `firestore.indexes.json` includes required indexes for audit logging:

```bash
# Check for audit_log indexes
grep -A 10 "audit_log" firestore.indexes.json
```

Expected indexes:
```json
{
  "collectionGroup": "audit_log",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "schoolId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "audit_log",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "action", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### 5.2 Deploy Firestore Indexes

Deploy the indexes:

```bash
firebase deploy --only firestore:indexes
```

Expected output:
```
=== Deploying to 'your-project-id'...

i  deploying firestore
i  firestore: reading indexes from firestore.indexes.json...
i  firestore: uploading indexes...
✔  firestore: deployed indexes successfully

✔  Deploy complete!
```

### 5.3 Monitor Index Creation

Indexes may take time to build, especially if you have existing data:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Indexes**
4. Check the status of the new indexes

Index statuses:
- **Building**: Index is being created (may take minutes to hours)
- **Enabled**: Index is ready to use
- **Error**: Index creation failed (check error message)

### 5.4 Verify Index Usage

After indexes are enabled, verify they're being used:

```bash
# Check Firestore logs for index usage
firebase firestore:logs --limit 10
```

### 5.5 Firestore Indexes Deployment Checklist

- [ ] Indexes file syntax is valid
- [ ] Indexes deployed successfully
- [ ] Audit log indexes are present
- [ ] Indexes show "Enabled" status in Firebase Console
- [ ] No index creation errors

---

## 6. Frontend Deployment

### 6.1 Install Frontend Dependencies

From the project root:

```bash
npm install
```

### 6.2 Build Frontend

Build the production frontend with environment variables:

```bash
# Clean previous build
npm run clean

# Build for production
npm run build
```

Expected output:
```
vite v6.2.0 building for production...
✓ 1234 modules transformed.
dist/index.html                   1.23 kB │ gzip: 0.56 kB
dist/assets/index-abc123.js     234.56 kB │ gzip: 78.90 kB
✓ built in 12.34s
```

### 6.3 Verify Build Output

Check that the build was successful:

```bash
ls -la dist/
```

You should see:
- `index.html`
- `assets/` directory with JavaScript and CSS files
- Other static assets

### 6.4 Test Build Locally (Optional)

Preview the production build locally:

```bash
npm run preview
```

Open `http://localhost:4173` in your browser and verify:
- Application loads correctly
- No console errors
- Environment variables are accessible

Press `Ctrl+C` to stop the preview server.

### 6.5 Deploy to Firebase Hosting

Deploy the built frontend:

```bash
firebase deploy --only hosting
```

Expected output:
```
=== Deploying to 'your-project-id'...

i  deploying hosting
i  hosting[your-project-id]: beginning deploy...
i  hosting[your-project-id]: found 123 files in dist
✔  hosting[your-project-id]: file upload complete
i  hosting[your-project-id]: finalizing version...
✔  hosting[your-project-id]: version finalized
i  hosting[your-project-id]: releasing new version...
✔  hosting[your-project-id]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project-id/overview
Hosting URL: https://your-project-id.web.app
```

### 6.6 Verify Frontend Deployment

1. Open the Hosting URL in your browser
2. Log in as a School Admin
3. Navigate to **Settings** → **Integrations** → **Google Workspace**
4. Verify the Integration Settings page loads correctly

### 6.7 Frontend Deployment Checklist

- [ ] Dependencies installed
- [ ] Build completed successfully
- [ ] Build output exists in `dist/` directory
- [ ] Frontend deployed to Firebase Hosting
- [ ] Hosting URL is accessible
- [ ] Application loads without errors
- [ ] Integration Settings page is accessible

---

## 7. Post-Deployment Verification

### 7.1 End-to-End OAuth Flow Test

Test the complete OAuth flow:

1. **Navigate to Integration Settings**
   - Log in as School Admin
   - Go to **Settings** → **Integrations** → **Google Workspace**

2. **Initiate Connection**
   - Click **Connect Google Workspace**
   - Verify redirect to Google OAuth consent screen

3. **Authorize Application**
   - Review requested permissions
   - Click **Allow**
   - Verify redirect back to AVENIR

4. **Verify Connection Status**
   - Check that status shows "Connected"
   - Verify connected account email is displayed
   - Verify workspace domain is displayed

### 7.2 Connection Verification Test

Test the connection verification functionality:

1. **Trigger Verification**
   - On Integration Settings page, click **Verify Connection**
   - Wait for verification to complete

2. **Check Service Status**
   - Verify all enabled services show "Connected" status:
     - ✅ Google Drive
     - ✅ Google Calendar
     - ✅ Google Classroom
     - ✅ Gmail

3. **Check Verification Timestamp**
   - Verify "Last verified" timestamp is recent

### 7.3 Token Refresh Test

Test automatic token refresh:

1. **Check Token Expiration**
   - Note the "Access token expires" time on Integration Settings page

2. **Wait for Token to Expire** (or manually expire in Firestore)
   - Wait until token is within 5 minutes of expiration

3. **Trigger API Call**
   - Click **Verify Connection** again
   - Token should refresh automatically

4. **Verify New Token**
   - Check that "Access token expires" time has been updated

### 7.4 Audit Log Verification

Verify that integration actions are logged:

1. **Navigate to Audit Log**
   - Go to **Settings** → **Audit Log**

2. **Filter by Google Actions**
   - Filter by action: `google.connected`
   - Verify connection event is logged with:
     - Your user ID
     - Timestamp
     - School ID

3. **Check Other Actions**
   - Filter by action: `google.verification_failed` (if any)
   - Filter by action: `google.token_refreshed` (if any)

### 7.5 Multi-Tenant Isolation Test

Verify that schools cannot access each other's integrations:

1. **Connect as School A Admin**
   - Connect Google Workspace for School A
   - Note the school ID

2. **Attempt Cross-School Access**
   - Try to read School B's integration document directly:
   ```javascript
   // In browser console
   const db = firebase.firestore();
   const docRef = db.doc('schools/school-b-id/integrations/google');
   docRef.get().catch(err => console.log('Expected error:', err.code));
   // Should log: "Expected error: permission-denied"
   ```

3. **Verify Isolation**
   - Confirm that permission is denied
   - Check Firestore rules are enforcing isolation

### 7.6 Disconnection Test

Test the disconnection flow:

1. **Disconnect Integration**
   - On Integration Settings page, click **Disconnect**
   - Confirm disconnection in dialog

2. **Verify Disconnection**
   - Check that status shows "Not Connected"
   - Verify "Connect Google Workspace" button is displayed

3. **Check Token Revocation**
   - Verify tokens are revoked with Google
   - Check audit log for `google.disconnected` action

4. **Reconnect**
   - Click **Connect Google Workspace** again
   - Verify OAuth flow works correctly

### 7.7 Error Handling Test

Test error scenarios:

1. **Cancel OAuth Flow**
   - Click **Connect Google Workspace**
   - Click **Cancel** on Google consent screen
   - Verify error message: "Authorization was cancelled"

2. **Insufficient Permissions**
   - (If possible) Deny some requested permissions
   - Verify error message indicates which scopes were denied

3. **Network Error**
   - (If possible) Disconnect network during verification
   - Verify error message indicates network issue

### 7.8 Post-Deployment Verification Checklist

- [ ] OAuth flow completes successfully
- [ ] Connection status displays correctly
- [ ] Connection verification tests all services
- [ ] Token refresh works automatically
- [ ] Audit log entries are created
- [ ] Multi-tenant isolation is enforced
- [ ] Disconnection works correctly
- [ ] Error messages are user-friendly
- [ ] No console errors in browser
- [ ] No errors in Cloud Functions logs

---

## Troubleshooting

### Deployment Errors

#### Error: "Firebase CLI not found"

**Solution:**
```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Verify installation
firebase --version
```

#### Error: "Permission denied" during deployment

**Solution:**
```bash
# Re-authenticate with Firebase
firebase login --reauth

# Verify authentication
firebase projects:list
```

#### Error: "Functions deployment failed"

**Solution:**
```bash
# Check for TypeScript compilation errors
cd functions
npm run build

# Check for missing dependencies
npm install

# Try deploying one function at a time
firebase deploy --only functions:connectGoogleWorkspace
```

### Environment Variable Errors

#### Error: "GOOGLE_CLIENT_ID is not defined"

**Solution:**
```bash
# Verify functions config
firebase functions:config:get

# Set missing variable
firebase functions:config:set google.client_id="YOUR_CLIENT_ID"

# Redeploy functions
firebase deploy --only functions
```

#### Error: "redirect_uri_mismatch"

**Solution:**
1. Check the exact redirect URI in the error message
2. Go to Google Cloud Console → **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add the exact URI to **Authorized redirect URIs**
5. Update `GOOGLE_REDIRECT_URI` environment variable
6. Redeploy functions

### Firestore Rules Errors

#### Error: "Rules compilation failed"

**Solution:**
```bash
# Check rules syntax
firebase firestore:rules:validate

# Fix syntax errors in firestore.rules
# Redeploy rules
firebase deploy --only firestore:rules
```

#### Error: "Permission denied" when accessing integration document

**Solution:**
1. Verify user is a School Admin
2. Verify user's `schoolId` matches the document path
3. Check Firestore rules in Firebase Console
4. Redeploy rules if needed

### Frontend Errors

#### Error: "Build failed"

**Solution:**
```bash
# Check for TypeScript errors
npm run lint

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Try building again
npm run build
```

#### Error: "Environment variables not accessible"

**Solution:**
1. Verify `.env` file exists in project root
2. Verify variables start with `VITE_` prefix
3. Rebuild frontend: `npm run build`
4. Redeploy: `firebase deploy --only hosting`

### Cloud Functions Errors

#### Error: "Function timeout"

**Solution:**
1. Check Cloud Functions logs: `firebase functions:log`
2. Increase function timeout in `functions/src/index.ts`:
   ```typescript
   export const connectGoogleWorkspace = functions
     .runWith({ timeoutSeconds: 300 }) // 5 minutes
     .https.onCall(async (data, context) => { ... });
   ```
3. Redeploy functions

#### Error: "Invalid refresh token"

**Solution:**
1. Token may have been revoked by user
2. Disconnect and reconnect integration
3. Check audit log for token refresh failures

---

## Rollback Procedures

### Rollback Cloud Functions

If a functions deployment causes issues:

```bash
# List function versions
firebase functions:list

# Rollback to previous version (if available)
# Note: Firebase doesn't support direct rollback, so redeploy previous code

# Option 1: Redeploy from previous commit
git checkout <previous-commit>
cd functions
npm run build
firebase deploy --only functions
git checkout main

# Option 2: Delete problematic functions
firebase functions:delete connectGoogleWorkspace
firebase functions:delete refreshGoogleToken
firebase functions:delete disconnectGoogleWorkspace
firebase functions:delete verifyGoogleConnection
```

### Rollback Firestore Rules

If rules deployment causes issues:

```bash
# Firestore rules can be rolled back in Firebase Console
# 1. Go to Firestore Database → Rules
# 2. Click "View history"
# 3. Select previous version
# 4. Click "Restore"

# Or redeploy from previous commit
git checkout <previous-commit>
firebase deploy --only firestore:rules
git checkout main
```

### Rollback Frontend

If frontend deployment causes issues:

```bash
# Firebase Hosting supports rollback
# 1. Go to Firebase Console → Hosting
# 2. Click on your site
# 3. Click "Release history"
# 4. Find previous version
# 5. Click "..." → "Rollback"

# Or redeploy from previous commit
git checkout <previous-commit>
npm run build
firebase deploy --only hosting
git checkout main
```

### Emergency Rollback (All Components)

If you need to rollback everything:

```bash
# Checkout previous stable commit
git checkout <previous-stable-commit>

# Rebuild and redeploy everything
cd functions
npm install
npm run build
cd ..

npm install
npm run build

firebase deploy --only functions,firestore:rules,firestore:indexes,hosting

# Return to main branch
git checkout main
```

---

## Deployment Checklist Summary

Use this checklist for each deployment:

### Pre-Deployment
- [ ] Google Cloud Console setup completed
- [ ] OAuth credentials obtained
- [ ] Firebase CLI installed and authenticated
- [ ] Correct Firebase project selected
- [ ] Environment variables configured

### Deployment
- [ ] Cloud Functions deployed successfully
- [ ] Firestore rules deployed successfully
- [ ] Firestore indexes deployed successfully
- [ ] Frontend built and deployed successfully

### Post-Deployment
- [ ] OAuth flow tested end-to-end
- [ ] Connection verification tested
- [ ] Token refresh tested
- [ ] Audit logging verified
- [ ] Multi-tenant isolation verified
- [ ] Disconnection tested
- [ ] Error handling tested
- [ ] No errors in logs

### Documentation
- [ ] Deployment notes documented
- [ ] Known issues documented
- [ ] Rollback plan prepared
- [ ] Team notified of deployment

---

## Related Documentation

- [Google Integration Setup Guide](./GOOGLE_INTEGRATION_SETUP.md) - Google Cloud Console configuration
- [Deploy Firestore Rules](./DEPLOY_FIRESTORE_RULES.md) - Detailed Firestore rules deployment
- [Multi-Tenancy Architecture](./MULTI_TENANCY_ARCHITECTURE.md) - Understanding school isolation

---

## Support

For deployment issues:

1. Check the troubleshooting section above
2. Review Cloud Functions logs: `firebase functions:log`
3. Check Firebase Console for errors
4. Review audit log for detailed error messages
5. Contact AVENIR platform administrator

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Maintained By**: AVENIR Development Team  
**Related Requirements**: 14.4, 14.5
