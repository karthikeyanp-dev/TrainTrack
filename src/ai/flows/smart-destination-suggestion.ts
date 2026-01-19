/**
 * @fileOverview An AI agent that suggests potential destinations and routes based on past booking data and popular travel trends.
 *
 * - suggestDestinations - A function that suggests destinations and routes.
 * - SuggestDestinationsInput - The input type for the suggestDestinations function.
 * - SuggestDestinationsOutput - The return type for the suggestDestinations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestDestinationsInputSchema = z.object({
  pastBookingData: z
    .string()
    .describe('JSON string containing past booking data, including source, destination, and date.'),
  popularTravelTrends: z
    .string()
    .describe('JSON string containing current popular travel trends.'),
});
export type SuggestDestinationsInput = z.infer<typeof SuggestDestinationsInputSchema>;

const SuggestDestinationsOutputSchema = z.array(
  z.object({
    destination: z.string().describe('The suggested destination.'),
    route: z.string().describe('The suggested route to the destination.'),
    reason: z.string().describe('The reason for suggesting this destination and route.'),
  })
);
export type SuggestDestinationsOutput = z.infer<typeof SuggestDestinationsOutputSchema>;

export async function suggestDestinations(
  input: SuggestDestinationsInput
): Promise<SuggestDestinationsOutput> {
  return suggestDestinationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestDestinationsPrompt',
  input: {schema: SuggestDestinationsInputSchema},
  output: {schema: SuggestDestinationsOutputSchema},
  prompt: `You are a travel expert. Based on the past booking data and popular travel trends,
you will suggest potential destinations and routes to the user.

Past Booking Data: {{{pastBookingData}}}
Popular Travel Trends: {{{popularTravelTrends}}}

Suggest destinations and routes in JSON format:
`,
});

const suggestDestinationsFlow = ai.defineFlow(
  {
    name: 'suggestDestinationsFlow',
    inputSchema: SuggestDestinationsInputSchema,
    outputSchema: SuggestDestinationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
