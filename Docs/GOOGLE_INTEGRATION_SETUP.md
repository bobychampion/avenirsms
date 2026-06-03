# Google Workspace Integration Setup Guide

## Overview

This guide walks you through the complete setup process for enabling Google Workspace integration in AVENIR. The integration allows schools to connect their own Google Workspace accounts to AVENIR, enabling future synchronization features for Drive, Calendar, Classroom, and Gmail.

**Important**: Each school manages its own Google Workspace connection independently. The platform owner does NOT centrally manage school Google accounts. Google integration is OPTIONAL—AVENIR functions fully without Google connectivity.

---

## Prerequisites

Before you begin, ensure you have:

- **Google Workspace Account**: A Google Workspace (formerly G Suite) account with admin privileges
- **Google Cloud Console Access**: Ability to create and configure projects in Google Cloud Console
- **AVENIR Admin Access**: School Admin or Super Admin role in AVENIR
- **Domain Verification**: Your school's domain verified in Google Workspace

---

## Part 1: Google Cloud Console Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top of the page
3. Click **New Project**
4. Enter project details:
   - **Project Name**: `AVENIR-Integration` (or your preferred name)
   - **Organization**: Select your school's organization (if applicable)
   - **Location**: Select your organization or leave as "No organization"
5. Click **Create**
6. Wait for the project to be created (this may take a few moments)
7. Select the newly created project from the project dropdown

### Step 2: Enable Required Google APIs

You need to enable four Google APIs for the integration to work:

#### Enable Google Drive API

1. In the Google Cloud Console, navigate to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click on **Google Drive API** in the results
4. Click **Enable**
5. Wait for the API to be enabled

#### Enable Google Calendar API

1. In the API Library, search for "Google Calendar API"
2. Click on **Google Calendar API** in the results
3. Click **Enable**

#### Enable Google Classroom API

1. In the API Library, search for "Google Classroom API"
2. Click on **Google Classroom API** in the results
3. Click **Enable**

#### Enable Gmail API

1. In the API Library, search for "Gmail API"
2. Click on **Gmail API** in the results
3. Click **Enable**

**Verification**: Navigate to **APIs & Services** → **Enabled APIs & services** and confirm all four APIs are listed.

---

## Part 2: OAuth Consent Screen Configuration

The OAuth consent screen is what users see when they authorize AVENIR to access their Google Workspace data.

### Step 1: Configure OAuth Consent Screen

1. In Google Cloud Console, navigate to **APIs & Services** → **OAuth consent screen**
2. Select **User Type**:
   - **Internal**: If your AVENIR instance is only for your organization (recommended for single-school deployments)
   - **External**: If you're running a multi-tenant AVENIR platform serving multiple schools
3. Click **Create**

### Step 2: Fill in App Information

#### App Information Section

- **App name**: `AVENIR School Management System`
- **User support email**: Select your school's support email from the dropdown
- **App logo** (optional): Upload your school or AVENIR logo (120x120px PNG or JPG)

#### App Domain Section

- **Application home page**: `https://your-avenir-domain.com`
- **Application privacy policy link**: `https://your-avenir-domain.com/privacy`
- **Application terms of service link**: `https://your-avenir-domain.com/terms`

#### Authorized Domains Section

Add your AVENIR domain:
- `your-avenir-domain.com` (without https://)

#### Developer Contact Information

- **Email addresses**: Add your technical team's email addresses

Click **Save and Continue**

### Step 3: Configure Scopes

1. Click **Add or Remove Scopes**
2. Add the following scopes by searching and selecting them:

| Scope | Purpose |
|-------|---------|
| `openid` | User authentication |
| `email` | Access user's email address |
| `profile` | Access user's basic profile info |
| `https://www.googleapis.com/auth/drive.file` | Access files created by AVENIR in Google Drive |
| `https://www.googleapis.com/auth/calendar` | Access and manage Google Calendar |
| `https://www.googleapis.com/auth/classroom.courses.readonly` | Read Google Classroom courses |
| `https://www.googleapis.com/auth/gmail.send` | Send emails via Gmail |

3. Click **Update** to save the scopes
4. Click **Save and Continue**

### Step 4: Test Users (For External User Type Only)

If you selected "External" user type:

1. Click **Add Users**
2. Add email addresses of users who will test the integration
3. Click **Add**
4. Click **Save and Continue**

**Note**: During development/testing, only these test users can authorize the app. You'll need to submit for verification before making it available to all users.

### Step 5: Review and Confirm

1. Review all the information you entered
2. Click **Back to Dashboard**

---

## Part 3: Create OAuth 2.0 Credentials

### Step 1: Create OAuth Client ID

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Application type**: **Web application**
4. Enter **Name**: `AVENIR Web Client`

### Step 2: Configure Authorized Redirect URIs

This is critical for security. The redirect URI is where Google sends users after they authorize the app.

1. Under **Authorized redirect URIs**, click **Add URI**
2. Add your callback URL(s):

**For Production**:
```
https://your-avenir-domain.com/api/google/callback
```

**For Development** (if testing locally):
```
http://localhost:3000/api/google/callback
```

**For Firebase Hosting**:
```
https://your-project-id.web.app/api/google/callback
https://your-project-id.firebaseapp.com/api/google/callback
```

3. Click **Create**

### Step 3: Save Your Credentials

After creating the OAuth client, you'll see a dialog with your credentials:

- **Client ID**: `your-client-id.apps.googleusercontent.com`
- **Client Secret**: `your-client-secret`

**Important**: 
- Copy both values immediately
- Store them securely (you'll need them for environment configuration)
- The Client Secret should be treated as a password—never commit it to version control

You can also download the credentials as JSON by clicking **Download JSON**.

---

## Part 4: Environment Configuration

### Step 1: Update Environment Variables

Add the following environment variables to your AVENIR deployment:

**For Firebase Functions** (`.env` file or Firebase Console):

```bash
# Google OAuth credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-avenir-domain.com/api/google/callback
```

**For Frontend** (`.env` file):

```bash
# Frontend-accessible Google Client ID
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=https://your-avenir-domain.com/api/google/callback
```

### Step 2: Deploy Environment Variables

#### Option 1: Firebase CLI (Recommended)

```bash
# Set environment variables for Cloud Functions
firebase functions:config:set \
  google.client_id="your-client-id.apps.googleusercontent.com" \
  google.client_secret="your-client-secret" \
  google.redirect_uri="https://your-avenir-domain.com/api/google/callback"

# Deploy functions with new config
firebase deploy --only functions
```

#### Option 2: Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Functions** → **Configuration**
4. Add the environment variables manually

### Step 3: Verify Configuration

After deployment, verify the environment variables are set:

```bash
firebase functions:config:get
```

You should see:

```json
{
  "google": {
    "client_id": "your-client-id.apps.googleusercontent.com",
    "client_secret": "your-client-secret",
    "redirect_uri": "https://your-avenir-domain.com/api/google/callback"
  }
}
```

---

## Part 5: Callback URL Whitelisting

### Step 1: Verify Redirect URI in Google Cloud Console

1. Go back to **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, verify your callback URL is listed:
   ```
   https://your-avenir-domain.com/api/google/callback
   ```

### Step 2: Test Callback URL

The callback URL must be:
- **Exact match**: No trailing slashes, query parameters, or fragments
- **HTTPS only**: HTTP is only allowed for localhost during development
- **Publicly accessible**: Google's servers must be able to reach this URL

**Common Mistakes**:
- ❌ `https://your-avenir-domain.com/api/google/callback/`  (trailing slash)
- ❌ `https://your-avenir-domain.com/api/google/callback?state=xyz`  (query parameter)
- ✅ `https://your-avenir-domain.com/api/google/callback`  (correct)

### Step 3: Update Callback URL if Needed

If you need to change the callback URL:

1. Update the **Authorized redirect URIs** in Google Cloud Console
2. Update the `GOOGLE_REDIRECT_URI` environment variable in your AVENIR deployment
3. Redeploy your Cloud Functions

---

## Part 6: Deploy AVENIR Integration Components

### Step 1: Deploy Cloud Functions

```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy Google integration functions
firebase deploy --only functions:connectGoogleWorkspace,functions:refreshGoogleToken,functions:disconnectGoogleWorkspace,functions:verifyGoogleConnection
```

### Step 2: Deploy Firestore Security Rules

```bash
# Deploy Firestore rules (includes Google integration rules)
firebase deploy --only firestore:rules
```

### Step 3: Deploy Firestore Indexes

```bash
# Deploy Firestore indexes (includes audit log indexes)
firebase deploy --only firestore:indexes
```

### Step 4: Deploy Frontend

```bash
# Build frontend with environment variables
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

---

## Part 7: Testing the Integration

### Step 1: Access Integration Settings

1. Log in to AVENIR as a School Admin
2. Navigate to **Settings** → **Integrations** → **Google Workspace**
3. You should see the Integration Settings page with a "Connect Google Workspace" button

### Step 2: Test OAuth Flow

1. Click **Connect Google Workspace**
2. You should be redirected to Google's OAuth consent screen
3. Review the requested permissions
4. Click **Allow** to authorize AVENIR
5. You should be redirected back to AVENIR
6. The Integration Settings page should now show "Connected" status

### Step 3: Verify Connection

1. On the Integration Settings page, click **Verify Connection**
2. AVENIR will test API access to all enabled services
3. You should see green checkmarks for:
   - ✅ Google Drive
   - ✅ Google Calendar
   - ✅ Google Classroom
   - ✅ Gmail

### Step 4: Check Audit Logs

1. Navigate to **Settings** → **Audit Log**
2. Filter by action: `google.connected`
3. Verify the connection event was logged with:
   - Your user ID
   - Timestamp
   - School ID

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Cause**: The callback URL in your OAuth request doesn't match the authorized redirect URIs in Google Cloud Console.

**Solution**:
1. Check the exact URL in the error message
2. Go to Google Cloud Console → **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add the exact URL from the error message to **Authorized redirect URIs**
5. Save and try again

### Error: "access_denied"

**Cause**: User cancelled the OAuth authorization or doesn't have permission to authorize.

**Solution**:
- Try the OAuth flow again
- Ensure the user is a Google Workspace admin
- Check that the user's email is added as a test user (for External user type)

### Error: "invalid_client"

**Cause**: The Client ID or Client Secret is incorrect.

**Solution**:
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables
2. Check for typos or extra spaces
3. Ensure you're using the correct credentials from Google Cloud Console
4. Redeploy Cloud Functions after updating environment variables

### Error: "insufficient_permissions" or "403 Forbidden"

**Cause**: The required Google API is not enabled or the OAuth scopes are insufficient.

**Solution**:
1. Go to Google Cloud Console → **APIs & Services** → **Library**
2. Verify all four APIs are enabled:
   - Google Drive API
   - Google Calendar API
   - Google Classroom API
   - Gmail API
3. Check the OAuth consent screen scopes match the required scopes
4. Try disconnecting and reconnecting the integration

### Connection Shows "Error" Status

**Cause**: Token refresh failed or API access was revoked.

**Solution**:
1. Click **Verify Connection** to test API access
2. Check the error message for specific service failures
3. Try clicking **Reconnect** to re-authorize
4. Check the audit log for detailed error messages

### Token Expired Error

**Cause**: The refresh token is invalid or revoked.

**Solution**:
1. Click **Disconnect** to remove the old connection
2. Click **Connect Google Workspace** to create a new connection
3. Authorize the app again
4. The new refresh token should work correctly

---

## Security Best Practices

### Protect Your Client Secret

- ✅ Store in environment variables or secret management system
- ✅ Use Firebase Functions config or Google Secret Manager
- ❌ Never commit to version control (add to `.gitignore`)
- ❌ Never expose to frontend code
- ❌ Never share in public documentation or support tickets

### Limit OAuth Scopes

- Only request scopes for services your school actually uses
- Review requested permissions regularly
- Use the principle of least privilege

### Monitor Integration Activity

- Regularly review the audit log for Google integration actions
- Set up alerts for suspicious activity (e.g., multiple failed connections)
- Monitor token refresh failures

### Rotate Credentials Periodically

- Consider rotating OAuth credentials annually
- Update environment variables and redeploy when rotating
- Notify school admins before credential rotation

---

## Multi-Tenant Considerations

### Each School Has Its Own Connection

- Each school in AVENIR connects their own Google Workspace account
- Tokens are isolated per school in Firestore: `schools/{schoolId}/integrations/google`
- One school cannot access another school's Google data

### Platform Owner Responsibilities

- Create and configure the Google Cloud project (one-time setup)
- Deploy the integration Cloud Functions
- Provide this setup guide to school administrators
- Monitor overall integration health

### School Administrator Responsibilities

- Authorize AVENIR to access their school's Google Workspace
- Enable/disable specific Google services (Drive, Calendar, Classroom, Gmail)
- Monitor connection status and verify periodically
- Disconnect integration if no longer needed

---

## API Quotas and Limits

### Google API Quotas

Each enabled API has default quotas:

| API | Default Quota | Typical Usage |
|-----|---------------|---------------|
| Google Drive API | 1,000 requests/100 seconds/user | Low (verification only) |
| Google Calendar API | 1,000,000 requests/day | Low (verification only) |
| Google Classroom API | 10,000 requests/day | Low (verification only) |
| Gmail API | 1,000,000,000 quota units/day | Low (verification only) |

**Note**: The foundation layer only makes verification API calls. Future sync features may require quota increases.

### Monitoring Quotas

1. Go to Google Cloud Console → **APIs & Services** → **Dashboard**
2. Click on an API to view quota usage
3. Set up quota alerts if needed

### Requesting Quota Increases

If you exceed default quotas:

1. Go to **APIs & Services** → **Quotas**
2. Select the API and quota metric
3. Click **Edit Quotas**
4. Fill out the quota increase request form
5. Wait for Google to review and approve (typically 2-3 business days)

---

## Maintenance and Updates

### Regular Maintenance Tasks

**Monthly**:
- Review audit logs for integration activity
- Check for failed token refreshes
- Verify all school connections are healthy

**Quarterly**:
- Review OAuth consent screen information for accuracy
- Update authorized redirect URIs if domains changed
- Check for Google API updates or deprecations

**Annually**:
- Consider rotating OAuth credentials
- Review and update requested scopes
- Audit which schools are actively using the integration

### Updating OAuth Scopes

If you need to add new scopes:

1. Update the OAuth consent screen in Google Cloud Console
2. Add the new scopes to the authorization request in code
3. Existing connections will need to re-authorize to grant new scopes
4. Use incremental authorization to avoid disrupting existing connections

### Handling Google API Deprecations

Google occasionally deprecates API versions:

1. Subscribe to Google Cloud Platform release notes
2. Monitor deprecation notices in Google Cloud Console
3. Update service layer code to use new API versions
4. Test thoroughly before deploying updates
5. Notify school admins of any required re-authorization

---

## Related Documentation

- [Multi-Tenancy Architecture](./MULTI_TENANCY_ARCHITECTURE.md) - Understanding school isolation
- [Deploy Firestore Rules](./DEPLOY_FIRESTORE_RULES.md) - Deploying security rules
- [RBAC Documentation](./rbac.md) - Role-based access control

---

## Support and Resources

### Google Documentation

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive API Reference](https://developers.google.com/drive/api/v3/reference)
- [Google Calendar API Reference](https://developers.google.com/calendar/api/v3/reference)
- [Google Classroom API Reference](https://developers.google.com/classroom/reference/rest)
- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)

### Firebase Documentation

- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)

### AVENIR Support

For issues specific to AVENIR's Google integration:

1. Check the troubleshooting section above
2. Review the audit log for detailed error messages
3. Contact your AVENIR platform administrator
4. Submit a support ticket with:
   - School ID
   - Error message
   - Steps to reproduce
   - Screenshots (if applicable)

---

**Last Updated**: 2025-01-XX  
**Document Version**: 1.0  
**Maintained By**: AVENIR Development Team
