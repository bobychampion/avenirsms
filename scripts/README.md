# Migration Scripts

## Remove Student Login Migration

### Overview

The `migrate-remove-student-login.ts` script safely removes all student authentication infrastructure from the system while preserving student academic data and parent portal functionality.

### Prerequisites

1. **Firebase Admin SDK Credentials**: Ensure you have a Firebase service account key file
2. **Environment Setup**: Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
   ```
3. **Dependencies**: Install required packages:
   ```bash
   npm install
   ```

### Usage

The script supports three modes of operation:

#### 1. Validation Only (Safe - No Changes)

Check current state without making any changes:

```bash
npx tsx scripts/migrate-remove-student-login.ts --validate-only
```

This will:
- Count student records
- Count student auth accounts
- Count student_logins entries
- Count students with loginEmail field
- Count parent-student linkages
- Generate a validation report

#### 2. Backup Only (Safe - No Destructive Operations)

Create a comprehensive backup and validation report:

```bash
npx tsx scripts/migrate-remove-student-login.ts --backup-only
```

This will:
- Export all relevant Firestore collections to JSON files
- Export student auth account details
- Generate a pre-migration validation report
- Save everything to `backups/student-login-removal-{timestamp}/`

**Recommended**: Run this first to ensure you have a backup before proceeding.

#### 3. Execute Migration (Destructive - Makes Changes)

Perform the full migration with backup:

```bash
npx tsx scripts/migrate-remove-student-login.ts --execute
```

This will:
1. Create a comprehensive backup
2. Generate pre-migration validation report
3. Delete all student Firebase Auth accounts
4. Remove `loginEmail` fields from student records
5. Delete the `student_logins` collection
6. Validate post-migration data integrity
7. Generate a detailed migration log

### What Gets Backed Up

The backup includes:
- `students.json` - All student records
- `student_logins.json` - All student login index entries
- `users.json` - All user records
- `student_auth_accounts.json` - Detailed student auth account information
- `validation_report.json` - Pre-migration validation metrics
- `migration.log` - Detailed operation log

### Safety Features

1. **Comprehensive Backup**: All data is backed up before any destructive operations
2. **Validation Checks**: Data integrity is validated before and after migration
3. **Detailed Logging**: All operations are logged for audit trail
4. **Batch Operations**: Uses Firestore batch operations for efficiency and atomicity
5. **Error Handling**: Gracefully handles errors and continues where possible

### Post-Migration Validation

The script automatically validates:
- ✓ Student record count unchanged
- ✓ All `loginEmail` fields removed
- ✓ `student_logins` collection empty
- ✓ No student auth accounts remain
- ✓ Parent-student linkages preserved

### Rollback

If the migration fails validation or you need to rollback:

1. Locate the backup directory: `backups/student-login-removal-{timestamp}/`
2. Use Firebase Admin SDK or Firestore console to restore data from JSON files
3. Restore collections in this order:
   - `users` collection
   - `students` collection (with `loginEmail` fields)
   - `student_logins` collection
4. Recreate Firebase Auth accounts using data from `student_auth_accounts.json`

### Example Workflow

```bash
# Step 1: Validate current state
npx tsx scripts/migrate-remove-student-login.ts --validate-only

# Step 2: Create backup (recommended)
npx tsx scripts/migrate-remove-student-login.ts --backup-only

# Step 3: Review backup files
ls -la backups/student-login-removal-*/

# Step 4: Execute migration
npx tsx scripts/migrate-remove-student-login.ts --execute

# Step 5: Review migration log
cat backups/student-login-removal-*/migration.log
```

### Troubleshooting

**Error: "Cannot find module 'firebase-admin'"**
- Run `npm install` to install dependencies

**Error: "Could not load the default credentials"**
- Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable
- Ensure the service account key file exists and is valid

**Error: "Permission denied"**
- Ensure the service account has the following roles:
  - Firebase Admin
  - Cloud Datastore User
  - Firebase Authentication Admin

**Migration validation failed**
- Check the migration log for details
- Review the validation report
- Do not proceed with code deployment until validation passes
- Consider restoring from backup if data integrity is compromised

### Requirements Mapping

This script implements the following requirements:
- **Requirement 1.1**: Delete all student Firebase Auth accounts
- **Requirement 1.2**: Remove student_logins collection
- **Requirement 1.3**: Remove loginEmail fields from student records
- **Requirement 10.2**: Preserve all other student data fields
- **Requirement 10.3**: Maintain data integrity
- **Requirement 10.4**: Create backup before destructive operations
- **Requirement 10.5**: Record counts for validation
- **Requirement 10.6**: Verify student record count unchanged
- **Requirement 10.7**: Verify academic data unchanged
- **Requirement 10.8**: Maintain referential integrity
- **Requirement 10.9**: Log all operations

### Support

For issues or questions:
1. Review the migration log in the backup directory
2. Check the validation report for data integrity issues
3. Consult the main requirements and design documents in `.kiro/specs/remove-student-login/`
