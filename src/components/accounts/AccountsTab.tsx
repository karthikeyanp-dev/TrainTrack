"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Edit3, Eye, EyeOff, Plus, X, CreditCard, UserCircle, Wallet, Calendar, TrendingUp, Users, Briefcase, Search, CheckCircle2, ChevronDown, ShieldCheck, ShieldAlert, ArrowUpDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { IrctcAccount } from "@/types/account";
import { getAccounts, addAccount, deleteAccount, updateAccount, getAccountStats, type AccountStats } from "@/lib/accountsClient";
import type { Handler } from "@/types/handler";
import { getHandlers, addHandler, updateHandler, deleteHandler, getHandlerStatsForHandlers, type HandlerStats } from "@/lib/handlersClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  isVerified: boolean;
  walletAmount: string;
  lastBookedDate: string;
}

export type AccountSortOption =
  | "wallet-desc"
  | "wallet-asc"
  | "last-booked-asc"
  | "last-booked-desc"
  | "current-month-asc"
  | "current-month-desc"
  | "prev-month-asc"
  | "prev-month-desc"
  | "username-asc";

function sortAccounts(
  accountsList: IrctcAccount[],
  sortOption: AccountSortOption,
  statsList: AccountStats[]
): IrctcAccount[] {
  const statsMap = new Map(statsList.map(s => [s.accountId, s]));

  return [...accountsList].sort((a, b) => {
    const statsA = statsMap.get(a.id);
    const statsB = statsMap.get(b.id);

    switch (sortOption) {
      case "wallet-desc":
        return b.walletAmount - a.walletAmount;

      case "wallet-asc":
        return a.walletAmount - b.walletAmount;

      case "last-booked-asc": {
        if (!a.lastBookedDate && !b.lastBookedDate) return 0;
        if (!a.lastBookedDate) return -1;
        if (!b.lastBookedDate) return 1;
        return a.lastBookedDate.localeCompare(b.lastBookedDate);
      }

      case "last-booked-desc": {
        if (!a.lastBookedDate && !b.lastBookedDate) return 0;
        if (!a.lastBookedDate) return 1;
        if (!b.lastBookedDate) return -1;
        return b.lastBookedDate.localeCompare(a.lastBookedDate);
      }

      case "current-month-asc": {
        const countA = statsA?.bookingCount ?? 0;
        const countB = statsB?.bookingCount ?? 0;
        return countA - countB;
      }

      case "current-month-desc": {
        const countA = statsA?.bookingCount ?? 0;
        const countB = statsB?.bookingCount ?? 0;
        return countB - countA;
      }

      case "prev-month-asc": {
        const countA = statsA?.previousMonthBookingCount ?? 0;
        const countB = statsB?.previousMonthBookingCount ?? 0;
        return countA - countB;
      }

      case "prev-month-desc": {
        const countA = statsA?.previousMonthBookingCount ?? 0;
        const countB = statsB?.previousMonthBookingCount ?? 0;
        return countB - countA;
      }

      case "username-asc":
        return a.username.localeCompare(b.username);

      default:
        return b.walletAmount - a.walletAmount;
    }
  });
}

function AccountSortSelect({
  value,
  onChange,
}: {
  value: AccountSortOption;
  onChange: (value: AccountSortOption) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
      <Select value={value} onValueChange={(val) => onChange(val as AccountSortOption)}>
        <SelectTrigger className="h-8 text-xs w-[150px] sm:w-[210px] bg-background/80 hover:bg-background border-border/80">
          <SelectValue placeholder="Sort by..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="wallet-desc">Wallet Balance (High → Low)</SelectItem>
          <SelectItem value="wallet-asc">Wallet Balance (Low → High)</SelectItem>
          <SelectItem value="last-booked-asc">Booked Date (Earliest First)</SelectItem>
          <SelectItem value="last-booked-desc">Booked Date (Latest First)</SelectItem>
          <SelectItem value="current-month-asc">This Month Bookings (Low → High)</SelectItem>
          <SelectItem value="current-month-desc">This Month Bookings (High → Low)</SelectItem>
          <SelectItem value="prev-month-asc">Last Month Bookings (Low → High)</SelectItem>
          <SelectItem value="prev-month-desc">Last Month Bookings (High → Low)</SelectItem>
          <SelectItem value="username-asc">Username (A → Z)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function AccountsManager({ searchQuery }: { searchQuery: string }) {
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

  const [isVerifiedOpen, setIsVerifiedOpen] = useState(true);
  const [isNonVerifiedOpen, setIsNonVerifiedOpen] = useState(true);

  const [verifiedSort, setVerifiedSort] = useState<AccountSortOption>("last-booked-asc");
  const [nonVerifiedSort, setNonVerifiedSort] = useState<AccountSortOption>("last-booked-asc");

  const [form, setForm] = useState<AccountFormState>({
    username: "",
    password: "",
    isVerified: false,
    walletAmount: "",
    lastBookedDate: "",
  });

  const [editForm, setEditForm] = useState<AccountFormState>({
    username: "",
    password: "",
    isVerified: false,
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
      setAccountStats(fetchedStats);
      setAccounts(sortAccounts(fetchedAccounts, "last-booked-asc", fetchedStats));
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
      isVerified: form.isVerified,
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
        isVerified: false,
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
    if (isNaN(amountToAdd) || amountToAdd === 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid non-zero amount.",
        variant: "destructive",
      });
      return;
    }

    const newWalletAmount = accountToTopUp.walletAmount + amountToAdd;

    // Ensure wallet balance never goes negative
    if (newWalletAmount < 0) {
      toast({
        title: "Insufficient Balance",
        description: `Cannot deduct more than available balance. Available: ₹${accountToTopUp.walletAmount.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingWallet(true);

    // We need to pass all required fields to updateAccount
    const result = await updateAccount(accountToTopUp.id, {
      walletAmount: newWalletAmount,
    });

    if (result.success) {
      const updatedAccount = { ...accountToTopUp, walletAmount: newWalletAmount };
      setAccounts(prev => prev.map(acc => acc.id === accountToTopUp.id ? updatedAccount : acc).sort((a, b) => b.walletAmount - a.walletAmount));
      const action = amountToAdd > 0 ? "Added" : "Deducted";
      toast({
        title: "Wallet Updated",
        description: `${action} ₹${Math.abs(amountToAdd).toFixed(2)} ${amountToAdd > 0 ? 'to' : 'from'} wallet. New balance: ₹${newWalletAmount.toFixed(2)}`,
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
      isVerified: account.isVerified ?? false,
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
      isVerified: editForm.isVerified,
      walletAmount: walletAmountNum,
      lastBookedDate: editForm.lastBookedDate || "",
    });

    if (result.success) {
      const updatedAccount = {
        ...accountToEdit,
        username: editForm.username.trim(),
        password: editForm.password.trim(),
        isVerified: editForm.isVerified,
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

  const { verifiedAccounts, nonVerifiedAccounts } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = q
      ? accounts.filter(a => a.username.toLowerCase().includes(q))
      : accounts;

    const rawVerified = matches.filter(a => Boolean(a.isVerified));
    const rawNonVerified = matches.filter(a => !a.isVerified);

    return {
      verifiedAccounts: sortAccounts(rawVerified, verifiedSort, accountStats),
      nonVerifiedAccounts: sortAccounts(rawNonVerified, nonVerifiedSort, accountStats),
    };
  }, [accounts, searchQuery, verifiedSort, nonVerifiedSort, accountStats]);

  const verifiedTotalCount = useMemo(() => accounts.filter(a => Boolean(a.isVerified)).length, [accounts]);
  const nonVerifiedTotalCount = accounts.length - verifiedTotalCount;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Stats Header */}
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full">
            <CreditCard className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Total Accounts:</span>
            <span className="font-semibold text-foreground">{totalAccounts}</span>
            <span className="text-xs text-muted-foreground border-l border-border/60 pl-2.5 ml-1 flex items-center gap-2">
              <span className="text-emerald-500 font-medium">{verifiedTotalCount} Verified</span>
              <span>•</span>
              <span className="text-amber-500 font-medium">{nonVerifiedTotalCount} Non-Verified</span>
            </span>
          </div>
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Total Wallet:</span>
            <span className="font-semibold text-foreground">₹{totalWalletAmount.toFixed(2)}</span>
          </div>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)} className="rounded-full">
            <Plus className="mr-2 h-4 w-4" /> Add Account
          </Button>
        )}
      </motion.div>

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

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isVerified"
                  checked={form.isVerified}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, isVerified: checked === true }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="isVerified" className="cursor-pointer">Verified</Label>
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

      {/* Account Collapsible Groups */}
      <div className="space-y-6">
        {/* Verified Accounts Group */}
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden shadow-sm transition-all duration-200 hover:border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted/30">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsVerifiedOpen(prev => !prev)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsVerifiedOpen(prev => !prev);
                }
              }}
              className="flex items-center justify-between flex-1 cursor-pointer select-none group/title focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg p-1 -m-1"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2 text-base group-hover/title:text-primary transition-colors">
                    Verified Accounts
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {verifiedAccounts.length}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Verified IRCTC Accounts
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium sm:ml-4">
                <span className="hidden md:inline">{isVerifiedOpen ? "Collapse" : "Expand"}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isVerifiedOpen ? "rotate-180" : ""
                  )}
                />
              </div>
            </div>
            <div className="flex items-center justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40 shrink-0">
              <AccountSortSelect value={verifiedSort} onChange={setVerifiedSort} />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isVerifiedOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-4 border-t border-border/40">
                  {verifiedAccounts.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {verifiedAccounts.map((account, index) => {
                        const stats = accountStats.find(s => s.accountId === account.id);
                        return (
                          <motion.div
                            key={account.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.04 }}
                          >
                            <Card className="group hover:shadow-lg transition-shadow duration-300">
                              <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                  <CardTitle className="text-base flex items-center gap-1.5">
                                    {account.username}
                                    {account.isVerified && (
                                      <CheckCircle2
                                        className="h-4 w-4 fill-green-600 text-white"
                                        aria-label="Verified"
                                      />
                                    )}
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
                                  <span style={labelHighlightStyle}>Booked ({new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleString('default', { month: 'long' })}): </span>
                                  {stats?.previousMonthBookingCount ?? 0}
                                </div>
                                <div>
                                  <span style={labelHighlightStyle}>Last Booked: </span>
                                  {account.lastBookedDate || "—"}
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {searchQuery.trim()
                        ? `No verified accounts match "${searchQuery}".`
                        : "No verified accounts found."}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Non-Verified Accounts Group */}
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden shadow-sm transition-all duration-200 hover:border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted/30">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsNonVerifiedOpen(prev => !prev)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsNonVerifiedOpen(prev => !prev);
                }
              }}
              className="flex items-center justify-between flex-1 cursor-pointer select-none group/title focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg p-1 -m-1"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2 text-base group-hover/title:text-primary transition-colors">
                    Non-Verified Accounts
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      {nonVerifiedAccounts.length}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Accounts pending verification
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium sm:ml-4">
                <span className="hidden md:inline">{isNonVerifiedOpen ? "Collapse" : "Expand"}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isNonVerifiedOpen ? "rotate-180" : ""
                  )}
                />
              </div>
            </div>
            <div className="flex items-center justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40 shrink-0">
              <AccountSortSelect value={nonVerifiedSort} onChange={setNonVerifiedSort} />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isNonVerifiedOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-4 border-t border-border/40">
                  {nonVerifiedAccounts.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {nonVerifiedAccounts.map((account, index) => {
                        const stats = accountStats.find(s => s.accountId === account.id);
                        return (
                          <motion.div
                            key={account.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.04 }}
                          >
                            <Card className="group hover:shadow-lg transition-shadow duration-300">
                              <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                  <CardTitle className="text-base flex items-center gap-1.5">
                                    {account.username}
                                    {account.isVerified && (
                                      <CheckCircle2
                                        className="h-4 w-4 fill-green-600 text-white"
                                        aria-label="Verified"
                                      />
                                    )}
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
                                  <span style={labelHighlightStyle}>Booked ({new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleString('default', { month: 'long' })}): </span>
                                  {stats?.previousMonthBookingCount ?? 0}
                                </div>
                                <div>
                                  <span style={labelHighlightStyle}>Last Booked: </span>
                                  {account.lastBookedDate || "—"}
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {searchQuery.trim()
                        ? `No non-verified accounts match "${searchQuery}".`
                        : "No non-verified accounts found."}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
            <DialogDescription>
              Add or deduct money from your IRCTC wallet balance. Use a negative amount (e.g. -500) to deduct.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Current Balance</Label>
              <div className="col-span-3">₹{accountToTopUp?.walletAmount.toFixed(2)}</div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right">Amount</Label>
              <Input
                id="amount"
                type="number"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="col-span-3"
                placeholder="e.g. 500 or -500"
                step="0.01"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-bold">New Total</Label>
              <div className={`col-span-3 font-bold ${(Number(topUpAmount) || 0) < 0 ? 'text-destructive' : ''}`}>
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-isVerified"
                checked={editForm.isVerified}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, isVerified: checked === true }))}
                disabled={isSubmitting}
              />
              <Label htmlFor="edit-isVerified" className="cursor-pointer">Verified</Label>
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
    </motion.div>
  );
}

function HandlersManager({ searchQuery }: { searchQuery: string }) {
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
      setHandlerStats(stats);

      const sortedHandlers = [...fetchedHandlers].sort((a, b) => {
        const statsA = stats.find(s => s.handlerId === a.id || s.name === a.name);
        const statsB = stats.find(s => s.handlerId === b.id || s.name === b.name);
        const countA = statsA?.bookingCount ?? 0;
        const countB = statsB?.bookingCount ?? 0;
        return countB - countA;
      });

      setHandlers(sortedHandlers);
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

      setName("");
      setShowAddForm(false);
      // Refresh stats and re-sort to include any newly recorded bookings mapping to this handler name
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

      setHandlerToEdit(null);
      // Refresh stats and re-sort in case the handler name changed
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

  const filteredHandlers = useMemo(() => {
    if (!searchQuery.trim()) return handlers;
    const q = searchQuery.toLowerCase();
    return handlers.filter(h => h.name.toLowerCase().includes(q));
  }, [handlers, searchQuery]);

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
        {filteredHandlers.map(handler => {
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
                  Last Updated: {stats?.lastAssignedDate
                    ? new Date(`${stats.lastAssignedDate}T00:00:00`).toLocaleDateString()
                    : new Date(handler.updatedAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredHandlers.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            {searchQuery.trim()
              ? `No handlers found matching "${searchQuery}".`
              : "No handlers added yet. Click 'Add Handler' to add your first handler."}
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
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search accounts and handlers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Tabs defaultValue="accounts" className="w-full" onValueChange={() => setSearchQuery('')}>
        <TabsList className="mb-4">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="handlers">Handlers</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">
          <AccountsManager searchQuery={searchQuery} />
        </TabsContent>
        <TabsContent value="handlers">
          <HandlersManager searchQuery={searchQuery} />
        </TabsContent>
      </Tabs>
    </>
  );
}
