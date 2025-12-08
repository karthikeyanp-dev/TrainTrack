# Firestore Setup for New Features

## Collections Added

This implementation adds two new Firestore collections:

1. **`irctcAccounts`** - Stores IRCTC user account information
2. **`bookingRecords`** - Stores booking completion records

## Required Firestore Security Rules

Add these rules to your Firestore security rules (in Firebase Console):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Existing bookings collection rules
    match /bookings/{bookingId} {
      allow read, write: if true; // Adjust based on your auth requirements
    }
    
    // New: IRCTC Accounts collection
    match /irctcAccounts/{accountId} {
      allow read, write: if true; // Adjust based on your auth requirements
    }
    
    // New: Booking Records collection
    match /bookingRecords/{recordId} {
      allow read, write: if true; // Adjust based on your auth requirements
    }
  }
}
```

**Note:** The above rules allow unrestricted access. In production, you should:
- Add authentication checks using `request.auth != null`
- Add user-specific rules if you have multi-user support
- Validate data structure with `request.resource.data`

## Firestore Indexes

The following composite indexes may be needed (Firebase will prompt you to create them when needed):

### For `bookingRecords` collection:
- Field: `bookingId` (Ascending)
- Field: `createdAt` (Descending)

### For `irctcAccounts` collection:
- Field: `createdAt` (Descending)

These indexes will be automatically suggested by Firebase when you first run queries that need them.

## Data Structure

### `irctcAccounts` Document
```typescript
{
  username: string;
  password: string;
  walletAmount: number;
  lastBookedDate: string; // "YYYY-MM-DD" or empty string
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `bookingRecords` Document
```typescript
{
  bookingId: string;
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: number;
  methodUsed: "Wallet" | "UPI" | "Others";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Testing

After deploying:

1. Go to the **Accounts** tab
2. Add a test IRCTC account
3. Go to a booking card in the **Bookings** tab
4. Click "Record Booking Details"
5. Fill in the form and save

Check your Firestore console to verify data is being stored correctly.
