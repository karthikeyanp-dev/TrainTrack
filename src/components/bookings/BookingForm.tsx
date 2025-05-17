
"use client";

import { useForm, useFieldArray } from "react-hook-form";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Loader2, PlusCircle, UserPlus, Users, X } from "lucide-react"; // Added X icon
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { addBooking, updateBookingById } from "@/actions/bookingActions";
import type { BookingFormData, Passenger, PassengerGender, TrainClass } from "@/types/booking";
import { ALL_TRAIN_CLASSES, ALL_PASSENGER_GENDERS } from "@/types/booking";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";

const passengerSchema = z.object({
  name: z.string().min(2, { message: "Passenger name must be at least 2 characters." }),
  age: z.coerce.number().positive({ message: "Age must be a positive number." }).max(120, { message: "Age seems too high."}),
  gender: z.enum(ALL_PASSENGER_GENDERS, { required_error: "Gender is required." }),
});

const bookingFormSchema = z.object({
  source: z.string().min(2, { message: "Source must be at least 2 characters." }),
  destination: z.string().min(2, { message: "Destination must be at least 2 characters." }),
  journeyDate: z.date({ required_error: "Journey date is required." }),
  userName: z.string().min(2, { message: "User name must be at least 2 characters." }),
  passengers: z.array(passengerSchema).min(1, { message: "At least one passenger is required." }),
  bookingDate: z.date({ required_error: "Booking date is required." }),
  classType: z.enum(ALL_TRAIN_CLASSES, { required_error: "Train class is required." }),
  trainPreference: z.string().optional(),
  timePreference: z.string().optional(),
});

type FormValues = z.infer<typeof bookingFormSchema>;

interface BookingFormProps {
  initialData?: BookingFormData & { journeyDateObj?: Date; bookingDateObj?: Date; passengers?: Passenger[] };
  bookingId?: string;
}

export function BookingForm({ initialData, bookingId }: BookingFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [journeyDatePopoverOpen, setJourneyDatePopoverOpen] = useState(false);
  const [bookingDatePopoverOpen, setBookingDatePopoverOpen] = useState(false);
  const isEditMode = !!bookingId;

  const form = useForm<FormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      source: initialData?.source || "",
      destination: initialData?.destination || "",
      journeyDate: initialData?.journeyDateObj,
      userName: initialData?.userName || "",
      passengers: initialData?.passengers && initialData.passengers.length > 0 ? initialData.passengers : [{ name: "", age: undefined, gender: undefined }],
      bookingDate: initialData?.bookingDateObj,
      classType: initialData?.classType || undefined,
      trainPreference: initialData?.trainPreference || "",
      timePreference: initialData?.timePreference || "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "passengers",
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        source: initialData.source,
        destination: initialData.destination,
        journeyDate: initialData.journeyDateObj,
        userName: initialData.userName,
        passengers: initialData.passengers && initialData.passengers.length > 0 ? initialData.passengers : [{ name: "", age: undefined, gender: undefined }],
        bookingDate: initialData.bookingDateObj,
        classType: initialData.classType,
        trainPreference: initialData.trainPreference || "",
        timePreference: initialData.timePreference || "",
      });
    }
  }, [initialData, form]);

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    const formDataForAction: BookingFormData = {
      ...values,
      journeyDate: format(values.journeyDate, "yyyy-MM-dd"),
      bookingDate: format(values.bookingDate, "yyyy-MM-dd"),
      classType: values.classType as TrainClass,
      passengers: values.passengers.map(p => ({
        ...p,
        age: Number(p.age) // Ensure age is a number
      })) as Passenger[],
      trainPreference: values.trainPreference || undefined,
      timePreference: values.timePreference || undefined,
    };

    const result = isEditMode && bookingId
      ? await updateBookingById(bookingId, formDataForAction)
      : await addBooking(formDataForAction);

    if (result.success && result.booking) {
      toast({
        title: isEditMode ? "Booking Updated!" : "Booking Request Added!",
        description: `Request for ${result.booking.userName} from ${result.booking.source} to ${result.booking.destination} ${isEditMode ? 'updated' : 'saved'}.`,
      });
      router.push("/");
      router.refresh();
    } else {
      let errorToastMessage = "An unexpected error occurred. Please try again.";
      if (result.errors) {
        const { formErrors, fieldErrors } = result.errors as any; // Cast to any to handle nested field errors

        if (formErrors && formErrors.length > 0) {
          errorToastMessage = formErrors.join(" ");
        } else if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          errorToastMessage = "Please check the form for specific errors highlighted below.";
           // Handle passengers array errors
          if (fieldErrors.passengers && Array.isArray(fieldErrors.passengers)) {
            fieldErrors.passengers.forEach((passengerError: any, index: number) => {
              if (passengerError) {
                Object.keys(passengerError).forEach(key => {
                  form.setError(`passengers.${index}.${key as keyof Passenger}` as any, {
                    type: 'server',
                    message: passengerError[key]?._errors?.join(', ') || "Invalid value"
                  });
                });
              }
            });
          } else if (typeof fieldErrors.passengers === 'object' && fieldErrors.passengers?._errors) {
             form.setError('passengers', { type: 'server', message: fieldErrors.passengers._errors.join(', ') });
          }


          // Handle other field errors
          (Object.keys(fieldErrors) as Array<keyof FormValues>).forEach((fieldName) => {
            if (fieldName !== 'passengers') {
              const messages = fieldErrors[fieldName]?._errors;
              if (messages && messages.length > 0) {
                form.setError(fieldName, {
                  type: "server",
                  message: messages.join(", "),
                });
              }
            }
          });
        } else {
          errorToastMessage = "Validation failed. Please check your input.";
        }

        if (formErrors && formErrors.length > 0) {
           form.setError("root.serverError", { type: "server", message: formErrors.join(", ") });
        }
      }

      toast({
        title: `Error ${isEditMode ? 'Updating' : 'Adding'} Booking`,
        description: errorToastMessage,
        variant: "destructive",
      });
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                  <Input
                    placeholder="e.g., TEN"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    value={field.value || ''}
                  />
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
                  <Input
                    placeholder="e.g., MS"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    value={field.value || ''}
                  />
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
                <Popover open={journeyDatePopoverOpen} onOpenChange={setJourneyDatePopoverOpen}>
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
                      onSelect={(date) => {
                        field.onChange(date);
                        setJourneyDatePopoverOpen(false);
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) && !isEditMode }
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
                <Popover open={bookingDatePopoverOpen} onOpenChange={setBookingDatePopoverOpen}>
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
                      onSelect={(date) => {
                        field.onChange(date);
                        setBookingDatePopoverOpen(false);
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) && !isEditMode}
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
          name="classType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Train Class</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ALL_TRAIN_CLASSES.map((classOption) => (
                    <SelectItem key={classOption} value={classOption}>
                      {classOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="userName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requested by</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Rajesh" {...field} value={field.value || ''}/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel className="flex items-center gap-2 mb-4 text-lg font-medium">
            <Users className="h-5 w-5" /> Passenger Details
          </FormLabel>
          {fields.map((item, index) => (
            <div key={item.id} className="space-y-4 p-4 mb-4 border rounded-md relative shadow-sm bg-card">
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="text-destructive hover:bg-destructive/10 md:absolute md:top-3 md:right-3 p-1"
                  aria-label="Remove passenger"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <FormField
                  control={form.control}
                  name={`passengers.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Passenger Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Full Name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`passengers.${index}.age`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 30" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`passengers.${index}.gender`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ALL_PASSENGER_GENDERS.map((gender) => (
                            <SelectItem key={gender} value={gender}>
                              {gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : 'Other'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ name: "", age: undefined, gender: undefined })}
            className="mt-2"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Add Passenger
          </Button>
           {form.formState.errors.passengers && !form.formState.errors.passengers.root && ( // For array-level errors (e.g., min length)
            <FormMessage className="mt-2">
              {form.formState.errors.passengers.message}
            </FormMessage>
          )}
           {form.formState.errors.passengers?.root && ( // For errors set by `setError("passengers.root.serverError", ...)`
             <FormMessage className="mt-2">
                {form.formState.errors.passengers.root.message}
             </FormMessage>
           )}
        </div>
        <Separator />

        <FormField
          control={form.control}
          name="trainPreference"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Train Preference (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Any express, specific train number" {...field} value={field.value || ''} />
              </FormControl>
              <FormDescription>
                Specify any preferred train(s) or types of trains.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="timePreference"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Time Preference (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Morning, after 6 PM, around noon" {...field} value={field.value || ''} />
              </FormControl>
              <FormDescription>
                Specify preferred departure or arrival times.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? (isEditMode ? "Updating..." : "Saving Request...") : (isEditMode ? "Update Booking" : "Save Booking Request")}
        </Button>
      </form>
    </Form>
  );
}

    