
"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Edit3, Eye, EyeOff } from "lucide-react";
import type { IrctcAccount } from "@/types/account";
import { getAccounts, addAccount, deleteAccount } from "@/actions/accountActions";
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

interface AccountFormState {
  username: string;
  password: string;
  walletAmount: string;
  lastBookedDate: string;
}

export function AccountsTab() {
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const [form, setForm] = useState<AccountFormState>({
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
      const fetchedAccounts = await getAccounts();
      setAccounts(fetchedAccounts);
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

      setAccounts(prev => [result.account!, ...prev]);

      setForm({
        username: "",
        password: "",
        walletAmount: "",
        lastBookedDate: "",
      });
    } else {
      const errorMessage = result.errors?.formErrors?.[0] || "Failed to add account";
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Add IRCTC Account</CardTitle>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map(account => (
          <Card key={account.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">
                  {account.username}
                </CardTitle>
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
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Password: </span>
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
              <div>
                <span className="font-medium">Wallet: </span>
                ₹{account.walletAmount.toFixed(2)}
              </div>
              <div>
                <span className="font-medium">Last Booked: </span>
                {account.lastBookedDate || "—"}
              </div>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            No accounts added yet. Use the form above to add your first IRCTC account.
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
    </div>
  );
}
