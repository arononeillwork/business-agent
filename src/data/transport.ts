export type RideOption = {
  name: string;
  type: "Licensed taxi" | "VTC (private hire)";
  pricing: string;
  airport: string;
  booking: string;
  bestFor: string;
  pros: string[];
  cons: string[];
  url: string;
};

export const rideOptions: RideOption[] = [
  {
    name: "PideTaxi",
    type: "Licensed taxi",
    pricing: "Official regulated meter fares, including fixed airport rates",
    airport: "Yes, taxis can use the airport taxi ranks and bus lanes",
    booking: "App, now or pre-booked. Pay in app, card or cash",
    bestFor: "Airport runs, late nights, anywhere local taxis cover",
    pros: ["Real local licensed taxis", "No surge pricing", "Can pre-book early flights"],
    cons: ["Fewer cars in quiet areas", "App is less polished than Uber"],
    url: "https://www.pidetaxi.es",
  },
  {
    name: "Uber",
    type: "VTC (private hire)",
    pricing: "Upfront price, with dynamic pricing at busy times",
    airport: "Yes, from designated VTC pickup points",
    booking: "App only, card or Apple/Google Pay",
    bestFor: "Visitors who already have the app, fare shown upfront",
    pros: ["Familiar app", "Price shown before booking"],
    cons: ["Surge pricing in summer and at events", "Fewer cars outside Marbella/Málaga centres"],
    url: "https://www.uber.com/es/en/",
  },
  {
    name: "Cabify",
    type: "VTC (private hire)",
    pricing: "Upfront fixed price, usually less surge-prone",
    airport: "Yes, from VTC pickup points",
    booking: "App, now or scheduled",
    bestFor: "Scheduled rides, business receipts",
    pros: ["Spanish company", "Good for scheduling"],
    cons: ["Coverage thinner outside Málaga city"],
    url: "https://cabify.com/es",
  },
  {
    name: "Bolt",
    type: "VTC (private hire)",
    pricing: "Often the cheapest upfront fare",
    airport: "Varies",
    booking: "App only",
    bestFor: "Budget rides in the city",
    pros: ["Low prices"],
    cons: ["Availability on the Costa del Sol is patchy"],
    url: "https://bolt.eu/es-es/",
  },
];

export const airportOptions = [
  { name: "Taxi (Málaga airport → Marbella)", detail: "≈ €75–95 regulated fare, about 40 min" },
  { name: "Avanza bus", detail: "≈ €10, about 45–60 min to Marbella bus station", url: "https://www.avanzabus.com" },
  { name: "Train + bus", detail: "Cercanías C1 to Fuengirola, then bus. Cheap but slow" },
  { name: "Car hire", detail: "Book ahead in summer and check the fuel policy" },
];
