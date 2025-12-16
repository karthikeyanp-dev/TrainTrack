# Firestore Setup for New Features

## Collections Added

This implementation adds three new Firestore collections:

1. **`irctcAccounts`** - Stores IRCTC user account information
2. **`bookingRecords`** - Stores booking completion records
3. **`handlers`** - Stores names of handlers (operators/agents)

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
    
    // IRCTC Accounts collection
    match /irctcAccounts/{accountId} {
      allow read, write: if true; // Adjust based on your auth requirements
    }
    
    // Booking Records collection
    match /bookingRecords/{recordId} {
      allow read, write: if true; // Adjust based on your auth requirements
    }

    // Handlers collection
    match /handlers/{handlerId} {
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

### For `handlers` collection:
- Field: `name` (Ascending)

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

### `handlers` Document
```typescript
{
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Testing

After deploying:

1. Go to the **Accounts** tab
2. Click on "Handlers" tab
3. Add a test Handler
4. Go to a booking card in the **Bookings** tab
5. Click "Record Booking Details"
6. Verify the Handler appears in the dropdown

Check your Firestore console to verify data is being stored correctly.
