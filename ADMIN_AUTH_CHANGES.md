# Admin Panel Roblox Authentication & Role Management

## Overview

The admin panel has been converted from the old admin key system to use Roblox authentication with role-based access control. Admins can now manage user roles directly from the admin panel.

## Changes Summary

### Authentication Changes

**Before:**
- Admin login used admin keys stored in `DBH.admins` table
- `/api/admin-login` endpoint validated admin keys

**After:**
- Admin login uses Roblox authentication via auth codes
- Users must have `admin` or `moderator` role to access admin panel
- Uses the same `/api/auth/*` endpoints as the main site
- Session tokens stored in `localStorage['auth_token']`

### New Features

1. **Roblox-Based Admin Login**
   - Admins log in using their Roblox account
   - Auth code system (same as main site)
   - Automatic role checking
   - Access denied if user doesn't have admin/moderator role

2. **User Management Panel**
   - Search users by username or user ID
   - View user details (avatar, username, display name, roles)
   - Add/remove roles with one click
   - Visual role indicators with color coding

3. **Role Management**
   - Admin role (red) - Full admin access
   - Moderator role (orange) - Moderation access
   - VIP role (purple) - VIP features
   - Donator role (green) - Donator benefits

## Files Modified

### Frontend
- **`admin.html`**
  - Updated login UI to use Roblox auth
  - Added User Management section
  - Added UserManagement JavaScript object
  - Updated Auth object to check for admin/moderator roles

### Backend
- **`functions/api/auth/[[path]].js`**
  - Added `handleUserSearch()` function
  - Added `/api/auth/user/search` endpoint
  - Existing `/api/auth/admin/update-role` endpoint now used by UI

## API Endpoints

### New Endpoint

#### `GET /api/auth/user/search`

Search for users in the database.

**Authorization:** Admin or Moderator role required

**Query Parameters:**
- `q` - Search query (username or user ID)

**Response:**
```json
{
  "users": [
    {
      "user_id": "123456789",
      "username": "EpicGamer123",
      "display_name": "Epic Gamer",
      "avatar_url": "https://...",
      "role": "[\"user\",\"vip\"]"
    }
  ]
}
```

### Existing Endpoint (Now Used by UI)

#### `POST /api/auth/admin/update-role`

Add or remove roles from users.

**Authorization:** Admin role required

**Request Body:**
```json
{
  "userId": "123456789",
  "role": "moderator",
  "action": "add"
}
```

**Valid Roles:**
- `admin`
- `moderator`
- `vip`
- `user`
- `donator` (note: not in validation list but supported)

**Valid Actions:**
- `add` - Add role to user
- `remove` - Remove role from user

**Response:**
```json
{
  "success": true,
  "roles": ["user", "moderator"]
}
```

## User Flow

### Admin Login Flow

1. Visit `/admin`
2. Click "Login with Roblox"
3. Get 6-digit auth code
4. Go to Epic Minigames on Roblox
5. Type code in chat
6. System verifies code and checks user roles
7. If user has `admin` or `moderator` role, access granted
8. Otherwise, show "Access Denied" error

### Role Management Flow

1. Log in to admin panel
2. Go to "User Management" section
3. Enter username or user ID in search box
4. Click "Search" or press Enter
5. View user's current roles
6. Click role button to add (+ icon) or remove (✓ icon)
7. Confirm action in dialog
8. Role updated immediately
9. User card refreshes to show new roles

## Role Colors

The UI uses color coding for roles:

| Role | Color | Hex Code |
|------|-------|----------|
| Admin | Red | #f44336 |
| Moderator | Orange | #ff9800 |
| VIP | Purple | #9c27b0 |
| Donator | Green | #4caf50 |
| User | Gray | #666666 |

## Security

### Access Control

- **Admin Panel Access:** Requires `admin` OR `moderator` role
- **User Search:** Requires `admin` OR `moderator` role
- **Role Management:** Requires `admin` role only

### Session Management

- Uses Bearer token authentication
- Tokens stored in localStorage
- Token validated on every API request
- Checks role from database on each protected endpoint
- Invalid/expired tokens rejected with 401/403

### Role Storage

- Roles stored as JSON array in `users.role` column
- Example: `["user", "admin"]`
- At least one role always present (defaults to `["user"]`)
- Duplicate role prevention

## Migration Notes

### For Existing Admins

**Old System:**
- Admins had admin keys
- Keys stored in `DBH.admins` table

**New System:**
- Admins need Roblox accounts
- Must have `admin` role in `users.role` column
- First-time access requires role assignment

### Granting Admin Access

To give someone admin access for the first time:

1. **Option A: Manual Database Update**
   ```sql
   UPDATE users
   SET role = '["user","admin"]'
   WHERE user_id = 'ROBLOX_USER_ID';
   ```

2. **Option B: Use Existing Admin**
   - Have an existing admin log in
   - Search for the user
   - Click "+ Admin" to grant admin role

### Removing Admin Keys (Optional)

The old `/api/admin-login` endpoint and `DBH.admins` table are no longer used and can be removed:

```sql
-- Optional: Remove old admin keys table
DROP TABLE IF EXISTS admins;
```

Delete the file:
```bash
rm functions/api/admin-login.js
```

**Note:** Keep these for now if you want a fallback during migration.

## Troubleshooting

### "Access Denied" on Login

**Problem:** User logs in with Roblox but gets access denied

**Solution:**
- Check user's roles in database
- User needs `admin` or `moderator` role
- Update roles manually or via another admin

**Check roles:**
```sql
SELECT user_id, username, role
FROM users
WHERE user_id = 'ROBLOX_USER_ID';
```

### Search Returns No Results

**Problem:** Searching for a user returns nothing

**Possible Causes:**
- User hasn't logged in to the site yet
- User data not in database
- Search query doesn't match username/ID

**Solution:**
- User must log in to main site at least once
- Try exact user ID instead of username
- Check database: `SELECT * FROM users WHERE username LIKE '%query%'`

### Role Changes Don't Work

**Problem:** Clicking role button doesn't update

**Possible Causes:**
- Not logged in as admin (moderators can't change roles)
- Network error
- Database error

**Solution:**
- Check browser console for errors
- Verify admin role (not just moderator)
- Check API response in Network tab

## Testing

### Test Checklist

- [ ] Admin can log in with Roblox account
- [ ] Non-admin users are denied access
- [ ] Moderators can access admin panel
- [ ] User search works by username
- [ ] User search works by user ID
- [ ] Can add roles to users
- [ ] Can remove roles from users
- [ ] Role changes persist after refresh
- [ ] UI updates after role changes
- [ ] Color coding displays correctly

### Test Scenario

1. **Create Test Users:**
   - User A: admin role
   - User B: moderator role
   - User C: user role only

2. **Test Access:**
   - User A should access admin panel ✓
   - User B should access admin panel ✓
   - User C should be denied ✓

3. **Test Role Management:**
   - User A searches for User C
   - User A adds VIP role to User C
   - Verify role updated in database
   - User B tries to change roles (should fail - moderators can't manage roles)

## Future Enhancements

Potential improvements:

1. **Bulk Role Management** - Add/remove roles for multiple users
2. **Role History** - Track who changed what role and when
3. **Activity Log** - Log all admin actions
4. **User Statistics** - Show user stats in management panel
5. **Ban/Unban** - Add user banning system
6. **Custom Roles** - Allow creating custom roles
7. **Permission System** - Granular permissions per role
8. **Audit Trail** - Complete audit log of all changes

## Credits

- Roblox authentication system from main site
- Role management using existing `/api/auth/admin/update-role` endpoint
- User search endpoint added for admin panel
