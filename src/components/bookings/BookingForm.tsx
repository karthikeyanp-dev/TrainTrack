
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { addBooking } from "@/actions/bookingActions";
import type { BookingFormData } from "@/types/booking";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

const bookingFormSchema = z.object({
  source: z.string().min(2, { message: "Source must be at least 2 characters." }),
  destination: z.string().min(2, { message: "Destination must be at least 2 characters." }),
  journeyDate: z.date({ required_error: "Journey date is required." }),
  userName: z.string().min(2, { message: "User name must be at least 2 characters." }),
  passengerDetails: z.string().min(5, { message: "Passenger details must be at least 5 characters." }),
  bookingDate: z.date({ required_error: "Booking date is required." }),
});

type FormValues = z.infer<typeof bookingFormSchema>;

export function BookingForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      source: "",
      destination: "",
      userName: "",
      passengerDetails: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    const formData: BookingFormData = {
      ...values,
      journeyDate: format(values.journeyDate, "yyyy-MM-dd"),
      bookingDate: format(values.bookingDate, "yyyy-MM-dd"),
    };

    const result = await addBooking(formData);

    if (result.success && result.booking) {
      toast({
        title: "Booking Request Added!",
        description: `Request for ${result.booking.userName} from ${result.booking.source} to ${result.booking.destination} saved.`,
      });
      router.push("/");
    } else {
      let errorToastMessage = "An unexpected error occurred. Please try again.";
      if (result.errors) {
        const { formErrors, fieldErrors } = result.errors;
        
        if (formErrors && formErrors.length > 0) {
          errorToastMessage = formErrors.join(" ");
        } else if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          errorToastMessage = "Please check the form for specific errors highlighted below.";
        } else {
          errorToastMessage = "Validation failed. Please check your input.";
        }

        if (fieldErrors) {
          (Object.keys(fieldErrors) as Array<keyof FormValues>).forEach((fieldName) => {
            const messages = fieldErrors[fieldName];
            if (messages && messages.length > 0) {
              form.setError(fieldName, {
                type: "server",
                message: messages.join(", "),
              });
            }
          });
        }
        
        if (formErrors && formErrors.length > 0) {
           // Display general form errors if not tied to specific fields, or as additional info
           // For react-hook-form, you can set a root error:
           form.setError("root.serverError", { type: "server", message: formErrors.join(", ") });
           // You would then need to display form.formState.errors.root?.serverError?.message somewhere in your form.
           // For now, the toast will carry the main message.
        }
      }
      
      toast({
        title: "Error Adding Booking",
        description: errorToastMessage,
        variant: "destructive",
      });
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Display root.serverError if you added logic for it */}
        {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive p-2 bg-destructive/10 rounded-md">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., New York" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Boston" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="journeyDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Journey</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) } // Disable past dates
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bookingDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date to be Booked By</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="userName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>User's Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="passengerDetails"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passenger Details</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., John Doe (Adult), Jane Doe (Child, 10 yrs)"
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Enter names, ages, and any other relevant details for all passengers.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Saving Request..." : "Save Booking Request"}
        </Button>
      </form>
    </Form>
  );
}

