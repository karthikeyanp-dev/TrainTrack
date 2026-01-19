
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRightLeft, CalendarIcon, Loader2, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { addBooking, updateBookingById } from "@/lib/firestoreClient";
import type { BookingFormData, Passenger, PassengerGender, TrainClass, BookingType } from "@/types/booking";
import { ALL_TRAIN_CLASSES, ALL_PASSENGER_GENDERS, ALL_BOOKING_TYPES } from "@/types/booking";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const passengerSchema = z.object({
  name: z.string().min(2, { message: "Passenger name must be at least 2 characters." }),
  age: z.union([
    z.string().min(1).pipe(z.coerce.number().min(1, "Age must be at least 1.").max(150, { message: "Age must be 150 or less."})),
    z.literal(""),
    z.literal(undefined)
  ]).optional(),
  gender: z.enum(ALL_PASSENGER_GENDERS, { errorMap: () => ({ message: "Gender is required." }) }).optional().or(z.literal(undefined)),
  berthRequired: z.boolean().optional(),
});

const bookingFormSchema = z.object({
  bookingType: z.enum(ALL_BOOKING_TYPES, { required_error: "Booking type is required." }),
  source: z.string().min(2, { message: "Source must be at least 2 characters." }),
  destination: z.string().min(2, { message: "Destination must be at least 2 characters." }),
  journeyDate: z.date({ required_error: "Journey date is required." }),
  userName: z.string().min(2, { message: "User name must be at least 2 characters." }),
  passengers: z.array(passengerSchema).min(1, { message: "At least one passenger is required." })
    .refine(passengers => passengers.every(p => p.name && p.age !== undefined && p.age !== "" && p.gender), {
      message: "All passenger details (name, age, gender) must be filled if a passenger entry is added.",
    }),
  bookingDate: z.date({ required_error: "Booking date is required." }),
  classType: z.enum(ALL_TRAIN_CLASSES, { required_error: "Train class is required." }),
  trainPreference: z.string().optional(),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof bookingFormSchema>;

interface BookingFormProps {
  initialData?: BookingFormData & { journeyDateObj?: Date; bookingDateObj?: Date; passengers?: Partial<Passenger>[] };
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
    defaultValues: initialData
      ? {
          ...initialData,
          journeyDate: initialData.journeyDateObj,
          bookingDate: initialData.bookingDateObj,
          trainPreference: initialData.trainPreference || "",
          remarks: initialData.remarks || "",
          passengers: initialData.passengers?.map(p => ({
            name: p.name || "",
            age: p.age !== undefined ? String(p.age) : undefined as any,
            gender: p.gender,
            berthRequired: p.berthRequired || false,
          })),
        }
      : {
          bookingType: "Tatkal",
          source: "",
          destination: "",
          userName: "",
          trainPreference: "",
          remarks: "",
          passengers: [{ name: "", age: undefined, gender: undefined, berthRequired: false }],
        },
  });


  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "passengers",
  });

  const handleSwap = () => {
    const sourceValue = form.getValues("source");
    const destinationValue = form.getValues("destination");
    form.setValue("source", destinationValue);
    form.setValue("destination", sourceValue);
  };

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);

    const formDataForAction: BookingFormData = {
      bookingType: values.bookingType,
      source: values.source,
      destination: values.destination,
      journeyDate: format(values.journeyDate, "yyyy-MM-dd"),
      bookingDate: format(values.bookingDate, "yyyy-MM-dd"),
      userName: values.userName,
      classType: values.classType as TrainClass,
      passengers: values.passengers
        .filter(p => p.name && p.age !== undefined && p.age !== "" && p.gender)
        .map(p => ({
          name: p.name!,
          age: Number(p.age!),
          gender: p.gender!,
          ...(p.berthRequired && { berthRequired: p.berthRequired }),
      })) as Passenger[],
      ...(values.trainPreference && values.trainPreference.trim() !== "" && { trainPreference: values.trainPreference }),
      ...(values.remarks && values.remarks.trim() !== "" && { remarks: values.remarks }),
    };

    if (formDataForAction.passengers.length === 0) {
        form.setError("passengers", { type: "manual", message: "At least one complete passenger entry is required."});
        setIsSubmitting(false);
        return;
    }
    
    const result = isEditMode && bookingId
      ? await updateBookingById(bookingId, formDataForAction)
      : await addBooking(formDataForAction);

    if (result.success && result.booking) {
      toast({
        title: isEditMode ? "Booking Updated!" : "Booking Request Added!",
        description: `Request for ${result.booking.userName} from ${result.booking.source} to ${result.booking.destination} ${isEditMode ? 'updated' : 'saved'}.`,
      });
      router.push("/");
    } else {
      const errorMessage = result.error || "An unexpected error occurred. Please try again.";
      toast({
        title: `Error ${isEditMode ? 'Updating' : 'Adding'} Booking`,
        description: errorMessage,
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

        <FormField
          control={form.control}
          name="bookingType"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Type</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1 md:flex-row md:space-y-0 md:space-x-4"
                >
                  {ALL_BOOKING_TYPES.map((type) => (
                     <FormItem key={type} className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={type} />
                        </FormControl>
                        <FormLabel className="font-normal">{type}</FormLabel>
                      </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem className="w-full">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleSwap}
              className="mt-1 md:mt-5 self-center"
              aria-label="Swap source and destination"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem className="w-full">
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
                {field.value && (
                  <p className="text-xs text-muted-foreground">{format(field.value, "EEEE")}</p>
                )}
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
                {field.value && (
                  <p className="text-xs text-muted-foreground">{format(field.value, "EEEE")}</p>
                )}
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
          <FormLabel className="flex items-center gap-2 mb-4 text-lg font-semibold">
            <Users className="h-6 w-6" /> Passenger Details
          </FormLabel>
          {fields.map((item, index) => (
            <div key={item.id} className="space-y-4 p-4 mb-4 border rounded-md relative shadow-sm bg-card">
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="text-destructive hover:bg-destructive/10 absolute top-2 right-2 md:top-3 md:right-3 p-1 h-7 w-7 md:h-8 md:w-8"
                  aria-label="Remove passenger"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <FormField
                  control={form.control}
                  name={`passengers.${index}.name`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-5">
                      <FormLabel>Passenger Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Full Name" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`passengers.${index}.age`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="e.g., 30"
                          {...field}
                          value={field.value ?? ''}
                          onChange={e => {
                            const value = e.target.value;
                            if (value === '' || /^[0-9]*$/.test(value)) {
                                field.onChange(value);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`passengers.${index}.gender`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-5">
                      <FormLabel>Gender</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value ?? undefined}
                          className="flex items-center space-x-4 pt-2"
                        >
                          {ALL_PASSENGER_GENDERS.map((gender) => (
                            <FormItem key={gender} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={gender} id={`${field.name}-${gender}`} />
                              </FormControl>
                              <FormLabel htmlFor={`${field.name}-${gender}`} className="font-normal cursor-pointer">
                                {gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : 'Other'}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Berth Required Checkbox - Show only for children aged 5-11 */}
              {(() => {
                const ageValue = form.watch(`passengers.${index}.age`);
                const age = ageValue ? Number(ageValue) : 0;
                const showBerthCheckbox = age >= 5 && age <= 11;
                
                return showBerthCheckbox ? (
                  <FormField
                    control={form.control}
                    name={`passengers.${index}.berthRequired`}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 mt-3 p-3 bg-muted/30 rounded-md">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value || false}
                            onChange={(e) => field.onChange(e.target.checked)}
                            className="h-4 w-4 mt-0.5 rounded border-gray-300"
                            id={`berth-${index}`}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel htmlFor={`berth-${index}`} className="text-sm font-normal cursor-pointer">
                            Berth Required (Child Passenger)
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            Check if a separate berth is needed for this child
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                ) : null;
              })()}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const newIndex = fields.length;
              append({ name: "", age: "", gender: undefined, berthRequired: false });
              // Explicitly clear the form values for the new passenger
              setTimeout(() => {
                form.setValue(`passengers.${newIndex}.name`, "");
                form.setValue(`passengers.${newIndex}.age`, "");
                form.resetField(`passengers.${newIndex}.gender`);
                form.setValue(`passengers.${newIndex}.berthRequired`, false);
              }, 0);
            }}
            className="mt-2"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Add Passenger
          </Button>
           {form.formState.errors.passengers && typeof form.formState.errors.passengers.message === 'string' && (
            <FormMessage className="mt-2">
              {form.formState.errors.passengers.message}
            </FormMessage>
          )}
           {form.formState.errors.passengers?.root && (
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
          name="remarks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remarks (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g., Morning, after 6 PM, around noon" {...field} value={field.value || ''} />
              </FormControl>
              <FormDescription>
                Specify any additional notes or preferences.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-4">
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? (isEditMode ? "Updating..." : "Saving Request...") : (isEditMode ? "Update Booking" : "Save Booking Request")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

    