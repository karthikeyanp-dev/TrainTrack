"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Booking, PreparedAccount } from "@/types/booking";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingRequirements } from "@/actions/bookingActions";
import { useToast } from "@/hooks/use-toast";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList, Plus, Trash2, LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const PreparedAccountSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  isMasterAdded: z.boolean(),
  isWalletLoaded: z.boolean(),
  handlingBy: z.string().optional(),
});

const FormSchema = z.object({
  accounts: z.array(PreparedAccountSchema),
});

type FormValues = z.infer<typeof FormSchema>;

interface BookingRequirementsSheetProps {
  booking: Booking;
  iconComponent?: LucideIcon;
}

export function BookingRequirementsSheet({ booking, iconComponent }: BookingRequirementsSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const IconComponent = iconComponent || ClipboardList;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      accounts: booking.preparedAccounts || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "accounts",
  });

  const mutation = useMutation({
    mutationFn: (data: PreparedAccount[]) =>
      updateBookingRequirements(booking.id, data),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
        toast({
          title: "Requirements Updated",
          description: "Booking requirements have been saved successfully.",
        });
        setIsOpen(false);
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update requirements.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update requirements: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data.accounts);
  };

  const handleAddAccount = () => {
    append({
      username: "",
      password: "",
      isMasterAdded: false,
      isWalletLoaded: false,
      handlingBy: "",
    });
  };

  // Reset form when sheet opens to get latest data
  const handleOpenChange = (open: boolean) => {
    if (open) {
      // Ensure all accounts have the handlingBy field, even if it's undefined in the data
      const accountsWithDefaults = (booking.preparedAccounts || []).map(acc => ({
        ...acc,
        handlingBy: acc.handlingBy || "",
      }));
      form.reset({
        accounts: accountsWithDefaults,
      });
    }
    setIsOpen(open);
  };

  const accountCount = booking.preparedAccounts?.length || 0;

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange} modal={false}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 aspect-square p-2 relative"
          title="Booking Requirements"
        >
          <IconComponent className="h-4 w-4" />
          {accountCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {accountCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Booking Requirements</SheetTitle>
          <SheetDescription>
            Add prepared account details for this booking. These will be included when sharing.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 py-4">
                {fields.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No accounts added yet.</p>
                    <p className="text-sm">Click the button below to add an account.</p>
                  </div>
                ) : (
                  fields.map((field, index) => (
                    <Card key={field.id} className="relative">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-muted-foreground">
                            Account #{index + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name={`accounts.${index}.username`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter username" {...field} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`accounts.${index}.password`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter password" {...field} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`accounts.${index}.handlingBy`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Handling By</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter handler name" {...field} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex gap-4">
                          <FormField
                            control={form.control}
                            name={`accounts.${index}.isMasterAdded`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer" onClick={() => field.onChange(!field.value)}>
                                  Master Added
                                </FormLabel>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`accounts.${index}.isWalletLoaded`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer" onClick={() => field.onChange(!field.value)}>
                                  Wallet Loaded
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="flex-col gap-2 pt-4 border-t sm:flex-col">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddAccount}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving..." : "Save Requirements"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
