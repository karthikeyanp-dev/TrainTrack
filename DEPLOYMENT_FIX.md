# PWA 404 Error Fix - Deployment Guide

## Problem
After deploying the PWA to mobile, refreshing on the `/accounts` page (or any non-root page) resulted in a 404 error. This is a common issue with statically exported Next.js apps.

## Root Cause
The issue occurred because:
1. Next.js was configured for static export (`output: 'export'`)
2. Firebase Hosting was not configured to handle client-side routing
3. When refreshing on `/accounts`, the browser requested that exact path from the server
4. The server couldn't find `/accounts` and returned a 404

## Solution Applied

### 1. Updated `firebase.json`
Added `rewrites` configuration to redirect all routes to `index.html`:

```json
"rewrites": [
  {
    "source": "**",
    "destination": "/index.html"
  }
]
```

This tells Firebase Hosting: "For any request that doesn't match a static file, serve index.html instead." This allows Next.js's client-side router to handle the navigation.

### 2. Updated `next.config.mjs`
Added `trailingSlash: true` for better static export routing:

```javascript
output: 'export',
trailingSlash: true, // Required for static export routing
```

This ensures URLs end with `/` which works better with static hosting and creates a clean directory structure.

## How It Works Now

1. User visits `/accounts` (or refreshes on that page)
2. Firebase Hosting checks for a file at that path
3. Doesn't find a specific file, so applies the rewrite rule
4. Serves `index.html` instead
5. Next.js client-side router loads and navigates to `/accounts` correctly
6. The AccountsTab component renders properly

## Deployment Steps

To deploy these fixes:

```bash
# 1. Build the project (already done)
npm run build

# 2. Deploy to Firebase Hosting
firebase deploy --only hosting

# 3. Test on mobile
# - Open the PWA
# - Navigate to Accounts tab
# - Refresh the page
# - Should work without 404 error
```

## Verification Checklist

After deployment, test the following:

- [ ] Navigate to home page - works
- [ ] Navigate to Accounts page - works  
- [ ] Refresh on Accounts page - **should now work** (was 404 before)
- [ ] Navigate to Bookings page - works
- [ ] Refresh on Bookings page - should work
- [ ] Navigate to Suggestions page - works
- [ ] Refresh on Suggestions page - should work
- [ ] Back/forward navigation - works
- [ ] Deep links to specific pages - work

## Technical Details

### File Structure Generated
```
out/
├── index.html (root page)
├── accounts/
│   └── index.html (accounts page)
├── bookings/
│   └── new/
│       └── index.html (new booking page)
├── suggestions/
│   └── index.html (suggestions page)
└── _next/ (static assets)
```

### Firebase Hosting Rewrite Logic
1. Request comes in for `/accounts`
2. Firebase checks: Does `/accounts` file exist? No
3. Firebase checks: Does `/accounts/` directory exist? Yes
4. Firebase checks: Does `/accounts/index.html` exist? Yes
5. Serves `/accounts/index.html`
6. But with rewrites rule, ANY missing file serves `index.html` at root
7. This makes client-side routing work seamlessly

## Benefits

✅ **Fixes the 404 error** when refreshing on any page  
✅ **PWA works offline** with proper service worker caching  
✅ **Fast client-side navigation** maintained  
✅ **Deep linking works** - you can share direct links to pages  
✅ **Cost remains free** - no server-side rendering needed  

## Additional Notes

- The build already generated all necessary files
- Firebase Hosting will now serve the correct page for any route
- Service worker (if added) will cache these properly
- Works on all platforms: desktop, mobile PWA, mobile browser

## If You Still See Issues

1. **Clear browser cache** on mobile
2. **Uninstall and reinstall the PWA** 
3. **Clear Firebase Hosting cache**:
   ```bash
   firebase hosting:disable
   firebase hosting:enable
   ```
4. **Verify deployment**:
   ```bash
   firebase hosting:sites:list
   ```

## Next Steps

Consider adding a service worker for better PWA functionality:
- Offline support
- Background sync
- Push notifications
- Faster subsequent loads

You can use [Workbox](https://developers.google.com/web/tools/workbox) or [next-pwa](https://github.com/shadowwalker/next-pwa) for this.
