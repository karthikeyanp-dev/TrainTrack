# Add Handlers Management and Integration

## Backend / Data Layer
1.  **Create Type Definition**: Create `src/types/handler.ts` to define the `Handler` interface (`id`, `name`, `createdAt`, `updatedAt`).
2.  **Create Server Actions**: Create `src/actions/handlerActions.ts` to handle CRUD operations for handlers using Firebase Firestore:
    *   `getHandlers()`
    *   `addHandler(name)`
    *   `updateHandler(id, name)`
    *   `deleteHandler(id)`

## Frontend - Accounts Tab
1.  **Refactor AccountsTab**: Modify `src/components/accounts/AccountsTab.tsx` to include tabs.
    *   Wrap existing content in a "Accounts" tab.
    *   Add a new "Handlers" tab.
2.  **Implement Handlers UI**: Inside the "Handlers" tab, implement:
    *   List of handlers.
    *   "Add Handler" form (Name input).
    *   Edit and Delete functionality for each handler.

## Frontend - Bookings Tab
1.  **Update Booking Requirements**: Modify `src/components/bookings/BookingRequirementsSheet.tsx`.
    *   Fetch handlers list.
    *   Replace the `handlingBy` text input with a dropdown/select menu populated with handler names.
2.  **Update Booking Record**: Modify `src/components/bookings/BookingRecordForm.tsx`.
    *   Fetch handlers list.
    *   Replace the `bookedBy` text input with a dropdown/select menu populated with handler names.
