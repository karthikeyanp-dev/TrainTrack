"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Edit3, Eye, EyeOff, Plus, X } from "lucide-react";
import type { IrctcAccount } from "@/types/account";
import { getAccounts, addAccount, deleteAccount, updateAccount, getAccountStats, type AccountStats } from "@/lib/accountsClient";
import type { Handler } from "@/types/handler";
import { getHandlers, addHandler, updateHandler, deleteHandler, getHandlerStatsForHandlers, type HandlerStats } from "@/lib/handlersClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const labelHighlightStyle = { color: '#AB945E', fontWeight: 700 };

interface AccountFormState {
  username: string;
  password: string;
  walletAmount: string;
  lastBookedDate: string;
}

function AccountsManager() {
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [accountStats, setAccountStats] = useState<AccountStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [accountToTopUp, setAccountToTopUp] = useState<IrctcAccount | null>(null);
  const [accountToEdit, setAccountToEdit] = useState<IrctcAccount | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>("");
  const [isUpdatingWallet, setIsUpdatingWallet] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState<AccountFormState>({
    username: "",
    password: "",
    walletAmount: "",
    lastBookedDate: "",
  });

  const [editForm, setEditForm] = useState<AccountFormState>({
    username: "",
    password: "",
    walletAmount: "",
    lastBookedDate: "",
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const [fetchedAccounts, fetchedStats] = await Promise.all([
        getAccounts(),
        getAccountStats()
      ]);
      setAccounts(fetchedAccounts.sort((a, b) => b.walletAmount - a.walletAmount));
      setAccountStats(fetchedStats);
    } catch (error) {
      toast({
        title: "Error Loading Accounts",
        description: "Failed to load IRCTC accounts",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof AccountFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const walletAmountNum = Number(form.walletAmount || 0);
    if (Number.isNaN(walletAmountNum)) {
      toast({
        title: "Invalid Input",
        description: "Wallet Amount must be a valid number",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!form.username.trim() || !form.password.trim()) {
      toast({
        title: "Missing Fields",
        description: "Username and Password are required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const result = await addAccount({
      username: form.username.trim(),
      password: form.password.trim(),
      walletAmount: walletAmountNum,
      lastBookedDate: form.lastBookedDate || "",
    });

    if (result.success && result.account) {
      toast({
        title: "Account Added",
        description: `IRCTC account ${result.account.username} has been saved.`,
      });

      setAccounts(prev => [result.account!, ...prev].sort((a, b) => b.walletAmount - a.walletAmount));

      setForm({
        username: "",
        password: "",
        walletAmount: "",
        lastBookedDate: "",
      });
      setShowAddForm(false);
    } else {
      const errorMessage = result.error || "Failed to add account";
      toast({
        title: "Error Adding Account",
        description: errorMessage,
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  const handleDeleteClick = (accountId: string) => {
    setAccountToDelete(accountId);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;

    const result = await deleteAccount(accountToDelete);

    if (result.success) {
      toast({
        title: "Account Deleted",
        description: "IRCTC account has been deleted.",
      });
      setAccounts(prev => prev.filter(acc => acc.id !== accountToDelete));
    } else {
      toast({
        title: "Error Deleting Account",
        description: result.error || "Failed to delete account",
        variant: "destructive",
      });
    }

    setShowDeleteDialog(false);
    setAccountToDelete(null);
  };

  const handleTopUpSubmit = async () => {
    if (!accountToTopUp) return;
    
    const amountToAdd = Number(topUpAmount);
    if (isNaN(amountToAdd) || amountToAdd <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid positive amount.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingWallet(true);
    const newWalletAmount = accountToTopUp.walletAmount + amountToAdd;
    
    // We need to pass all required fields to updateAccount
    const result = await updateAccount(accountToTopUp.id, {
        walletAmount: newWalletAmount,
    });

    if (result.success) {
      const updatedAccount = { ...accountToTopUp, walletAmount: newWalletAmount };
      setAccounts(prev => prev.map(acc => acc.id === accountToTopUp.id ? updatedAccount : acc).sort((a, b) => b.walletAmount - a.walletAmount));
      toast({
        title: "Wallet Updated",
        description: `Added ₹${amountToAdd} to wallet. New balance: ₹${newWalletAmount.toFixed(2)}`,
      });
      setAccountToTopUp(null);
      setTopUpAmount("");
    } else {
      toast({
        title: "Update Failed",
        description: result.error || "Failed to update wallet amount.",
        variant: "destructive",
      });
    }
    setIsUpdatingWallet(false);
  };

  const handleEditClick = (account: IrctcAccount) => {
    setAccountToEdit(account);
    setEditForm({
      username: account.username,
      password: account.password,
      walletAmount: account.walletAmount.toString(),
      lastBookedDate: account.lastBookedDate || "",
    });
  };

  const handleEditChange = (field: keyof AccountFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditForm(prev => ({ ...prev, [field]: e.target.value }));
    };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountToEdit) return;
    setIsSubmitting(true);

    const walletAmountNum = Number(editForm.walletAmount || 0);
    if (Number.isNaN(walletAmountNum)) {
      toast({
        title: "Invalid Input",
        description: "Wallet Amount must be a valid number",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!editForm.username.trim() || !editForm.password.trim()) {
      toast({
        title: "Missing Fields",
        description: "Username and Password are required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const result = await updateAccount(accountToEdit.id, {
      username: editForm.username.trim(),
      password: editForm.password.trim(),
      walletAmount: walletAmountNum,
      lastBookedDate: editForm.lastBookedDate || "",
    });

    if (result.success) {
      const updatedAccount = {
        ...accountToEdit,
        username: editForm.username.trim(),
        password: editForm.password.trim(),
        walletAmount: walletAmountNum,
        lastBookedDate: editForm.lastBookedDate || "",
      };
      toast({
        title: "Account Updated",
        description: `IRCTC account ${updatedAccount.username} has been updated.`,
      });

      setAccounts(prev => prev.map(acc => acc.id === accountToEdit.id ? updatedAccount : acc).sort((a, b) => b.walletAmount - a.walletAmount));
      setAccountToEdit(null);
    } else {
      const errorMessage = result.error || "Failed to update account";
      toast({
        title: "Error Updating Account",
        description: errorMessage,
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  const togglePasswordVisibility = (accountId: string) => {
    setVisiblePasswords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const maskPassword = (password: string) => "•".repeat(Math.min(password.length, 8));

  const totalAccounts = accounts.length;
  const totalWalletAmount = accounts.reduce((sum, acc) => sum + acc.walletAmount, 0);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground">
          Total Accounts: <span className="font-medium text-foreground">{totalAccounts}</span>
          <span className="mx-2">•</span>
          Total Wallet: <span className="font-medium text-foreground">₹{totalWalletAmount.toFixed(2)}</span>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Account
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card className="max-w-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Add IRCTC Account</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowAddForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={form.username}
                onChange={handleChange("username")}
                placeholder="IRCTC username"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={handleChange("password")}
                placeholder="IRCTC password"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walletAmount">Wallet Amount</Label>
              <Input
                id="walletAmount"
                type="number"
                value={form.walletAmount}
                onChange={handleChange("walletAmount")}
                placeholder="e.g. 1500"
                min={0}
                step="0.01"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastBookedDate">Last Booked Date</Label>
              <Input
                id="lastBookedDate"
                type="date"
                value={form.lastBookedDate}
                onChange={handleChange("lastBookedDate")}
                disabled={isSubmitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Adding..." : "Add Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map(account => {
          const stats = accountStats.find(s => s.accountId === account.id);
          return (
          <Card key={account.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">
                  {account.username}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => handleEditClick(account)}
                    title="Edit Account"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteClick(account.id)}
                    title="Delete Account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span style={labelHighlightStyle}>Password: </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">
                    {visiblePasswords.has(account.id) 
                      ? account.password 
                      : maskPassword(account.password)
                    }
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => togglePasswordVisibility(account.id)}
                    title={visiblePasswords.has(account.id) ? "Hide password" : "Show password"}
                  >
                    {visiblePasswords.has(account.id) 
                      ? <EyeOff className="h-3 w-3" /> 
                      : <Eye className="h-3 w-3" />
                    }
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span style={labelHighlightStyle}>Wallet: </span>
                <span>₹{account.walletAmount.toFixed(2)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-primary hover:text-primary px-2 text-xs"
                  onClick={() => {
                    setAccountToTopUp(account);
                    setTopUpAmount("");
                  }}
                  title="Add Wallet Amount"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <div>
                <span style={labelHighlightStyle}>Booked ({new Date().toLocaleString('default', { month: 'long' })}): </span>
                {stats?.bookingCount ?? 0}
              </div>
              <div>
                <span style={labelHighlightStyle}>Last Booked: </span>
                {account.lastBookedDate || "—"}
              </div>
            </CardContent>
          </Card>
          );
        })}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            No accounts added yet. Click &apos;Add Account&apos; to add your first IRCTC account.
          </p>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the IRCTC account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAccountToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!accountToTopUp} onOpenChange={(open) => !open && setAccountToTopUp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Wallet Amount</DialogTitle>
            <DialogDescription>
              Add money to your IRCTC wallet balance.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Current Balance</Label>
              <div className="col-span-3">₹{accountToTopUp?.walletAmount.toFixed(2)}</div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right">Amount to Add</Label>
              <Input
                id="amount"
                type="number"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="col-span-3"
                placeholder="e.g. 500"
                min="0"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-bold">New Total</Label>
              <div className="col-span-3 font-bold">
                ₹{((accountToTopUp?.walletAmount || 0) + (Number(topUpAmount) || 0)).toFixed(2)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountToTopUp(null)}>Cancel</Button>
            <Button onClick={handleTopUpSubmit} disabled={isUpdatingWallet}>
              {isUpdatingWallet && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!accountToEdit} onOpenChange={(open) => !open && setAccountToEdit(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit IRCTC Account</DialogTitle>
            <DialogDescription>
              Update account details.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                value={editForm.username}
                onChange={handleEditChange("username")}
                placeholder="IRCTC username"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                type="text"
                value={editForm.password}
                onChange={handleEditChange("password")}
                placeholder="IRCTC password"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-walletAmount">Wallet Amount</Label>
              <Input
                id="edit-walletAmount"
                type="number"
                value={editForm.walletAmount}
                onChange={handleEditChange("walletAmount")}
                placeholder="e.g. 1500"
                min={0}
                step="0.01"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-lastBookedDate">Last Booked Date</Label>
              <Input
                id="edit-lastBookedDate"
                type="date"
                value={editForm.lastBookedDate}
                onChange={handleEditChange("lastBookedDate")}
                disabled={isSubmitting}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccountToEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HandlersManager() {
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [handlerStats, setHandlerStats] = useState<HandlerStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [handlerToDelete, setHandlerToDelete] = useState<string | null>(null);
  const [handlerToEdit, setHandlerToEdit] = useState<Handler | null>(null);
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadHandlers();
  }, []);

  const loadHandlers = async () => {
    setIsLoading(true);
    try {
      const fetchedHandlers = await getHandlers();
      const stats = await getHandlerStatsForHandlers(fetchedHandlers);
      setHandlers(fetchedHandlers);
      setHandlerStats(stats);
    } catch (error) {
      toast({
        title: "Error Loading Handlers",
        description: "Failed to load handlers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!name.trim()) {
      toast({
        title: "Missing Fields",
        description: "Handler name is required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const result = await addHandler({
      name: name.trim(),
    });

    if (result.success && result.handler) {
      toast({
        title: "Handler Added",
        description: `Handler ${result.handler.name} has been saved.`,
      });

      setHandlers(prev => [...prev, result.handler!].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setName("");
      setShowAddForm(false);
      // Refresh stats to include any newly recorded bookings mapping to this handler name
      loadHandlers();
    } else {
      const errorMessage = result.error || "Failed to add handler";
      toast({
        title: "Error Adding Handler",
        description: errorMessage,
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  const handleDeleteClick = (handlerId: string) => {
    setHandlerToDelete(handlerId);
  };

  const handleDeleteConfirm = async () => {
    if (!handlerToDelete) return;

    const result = await deleteHandler(handlerToDelete);

    if (result.success) {
      toast({
        title: "Handler Deleted",
        description: "Handler has been deleted.",
      });
      setHandlers(prev => prev.filter(h => h.id !== handlerToDelete));
      setHandlerStats(prev => prev.filter(s => s.handlerId !== handlerToDelete));
    } else {
      toast({
        title: "Error Deleting Handler",
        description: result.error || "Failed to delete handler",
        variant: "destructive",
      });
    }

    setHandlerToDelete(null);
  };

  const handleEditClick = (handler: Handler) => {
    setHandlerToEdit(handler);
    setEditName(handler.name);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handlerToEdit) return;
    setIsSubmitting(true);

    if (!editName.trim()) {
      toast({
        title: "Missing Fields",
        description: "Handler name is required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const result = await updateHandler(handlerToEdit.id, {
      name: editName.trim(),
    });

    if (result.success) {
      const updatedHandler = { ...handlerToEdit, name: editName.trim() };
      toast({
        title: "Handler Updated",
        description: `Handler ${updatedHandler.name} has been updated.`,
      });

      setHandlers(prev =>
        prev
          .map(h => (h.id === handlerToEdit.id ? updatedHandler : h))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      );
      setHandlerToEdit(null);
      // Refresh stats in case the handler name changed
      loadHandlers();
    } else {
      const errorMessage = result.error || "Failed to update handler";
      toast({
        title: "Error Updating Handler",
        description: errorMessage,
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground">
          Total Handlers: <span className="font-medium text-foreground">{handlers.length}</span>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Handler
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card className="max-w-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Add Handler</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowAddForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="handler-name">Name</Label>
                <Input
                  id="handler-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Handler Name"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Adding..." : "Add Handler"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {handlers.map(handler => {
          const stats = handlerStats.find(s => s.handlerId === handler.id || s.name === handler.name);
          return (
            <Card key={handler.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base">
                    {handler.name}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEditClick(handler)}
                      title="Edit Handler"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(handler.id)}
                      title="Delete Handler"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span style={labelHighlightStyle}>Bookings (since Jan 1, 2026): </span>
                  {stats?.bookingCount ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last Updated: {new Date(handler.updatedAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {handlers.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            No handlers added yet. Click &apos;Add Handler&apos; to add your first handler.
          </p>
        )}
      </div>

      <AlertDialog open={!!handlerToDelete} onOpenChange={(open) => !open && setHandlerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Handler?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the handler.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHandlerToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!handlerToEdit} onOpenChange={(open) => !open && setHandlerToEdit(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Handler</DialogTitle>
            <DialogDescription>
              Update handler details.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="space-y-2">
              <Label htmlFor="edit-handler-name">Name</Label>
              <Input
                id="edit-handler-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Handler Name"
                required
                disabled={isSubmitting}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHandlerToEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AccountsTab() {
  return (
    <Tabs defaultValue="accounts" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="accounts">Accounts</TabsTrigger>
        <TabsTrigger value="handlers">Handlers</TabsTrigger>
      </TabsList>
      <TabsContent value="accounts">
        <AccountsManager />
      </TabsContent>
      <TabsContent value="handlers">
        <HandlersManager />
      </TabsContent>
    </Tabs>
  );
}
