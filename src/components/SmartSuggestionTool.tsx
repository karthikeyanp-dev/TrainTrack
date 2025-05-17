"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Lightbulb, Info } from "lucide-react";
import { suggestDestinations, type SuggestDestinationsInput, type SuggestDestinationsOutput } from "@/ai/flows/smart-destination-suggestion";
import { getAllBookingsAsJsonString } from "@/actions/bookingActions";
import { Label } from "@/components/ui/label";

export function SmartSuggestionTool() {
  const [pastBookingData, setPastBookingData] = useState<string>("");
  const [popularTravelTrends, setPopularTravelTrends] = useState<string>(
    JSON.stringify([
      { trend: "Weekend getaways to nearby cities", popularity: "High" },
      { trend: "Coastal destinations for summer", popularity: "Medium" },
      { trend: "Mountain retreats for autumn", popularity: "High" },
      { trend: "Cultural tours in historic cities", popularity: "Low" },
    ], null, 2)
  );
  const [suggestions, setSuggestions] = useState<SuggestDestinationsOutput | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBookings() {
      try {
        setIsLoadingBookings(true);
        const bookingsJson = await getAllBookingsAsJsonString();
        setPastBookingData(bookingsJson);
      } catch (err) {
        setError("Failed to load past booking data.");
        console.error(err);
      } finally {
        setIsLoadingBookings(false);
      }
    }
    fetchBookings();
  }, []);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    setSuggestions(null);

    try {
      const input: SuggestDestinationsInput = {
        pastBookingData,
        popularTravelTrends,
      };
      const result = await suggestDestinations(input);
      setSuggestions(result);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unknown error occurred while fetching suggestions.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-primary" />
          Smart Destination Suggester
        </CardTitle>
        <CardDescription>
          Get AI-powered destination and route suggestions based on booking history and travel trends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="pastBookingData" className="mb-2 block font-medium">Past Booking Data (auto-filled)</Label>
          {isLoadingBookings ? (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading booking data...</span>
            </div>
          ) : (
            <Textarea
              id="pastBookingData"
              value={pastBookingData}
              onChange={(e) => setPastBookingData(e.target.value)}
              placeholder="Enter past booking data as JSON..."
              rows={8}
              className="text-xs"
              disabled={isLoadingBookings}
            />
          )}
        </div>
        <div>
          <Label htmlFor="popularTravelTrends" className="mb-2 block font-medium">Popular Travel Trends (editable)</Label>
          <Textarea
            id="popularTravelTrends"
            value={popularTravelTrends}
            onChange={(e) => setPopularTravelTrends(e.target.value)}
            placeholder="Enter popular travel trends as JSON..."
            rows={8}
            className="text-xs"
          />
        </div>
        <Button onClick={handleSubmit} disabled={isLoading || isLoadingBookings} className="w-full">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="mr-2 h-4 w-4" />
          )}
          Get Suggestions
        </Button>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {suggestions && (
          <div className="mt-6 space-y-4">
            <h3 className="text-xl font-semibold">Suggested Destinations:</h3>
            {suggestions.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No Suggestions</AlertTitle>
                <AlertDescription>The AI couldn't generate any suggestions based on the provided data. Try adjusting the inputs.</AlertDescription>
              </Alert>
            ) : (
              suggestions.map((suggestion, index) => (
                <Card key={index} className="bg-background/50">
                  <CardHeader>
                    <CardTitle className="text-lg">{suggestion.destination}</CardTitle>
                    <CardDescription>Route: {suggestion.route}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
         <p className="text-xs text-muted-foreground">
            Note: AI suggestions are based on provided data and may require further validation.
          </p>
      </CardFooter>
    </Card>
  );
}
