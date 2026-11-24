// The "Adding up hours and tips" video, "Month end without the spreadsheet.": its timeline in frames at 30 fps. The
// music (video/music/hours.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const HOURS = {
  title: [0, 120],      // bars 1-2   "Month end without the spreadsheet."
  problem: [120, 480],  // bars 3-8   month end: a paper timesheet added up by hand, a tip jar and "÷ hours?"
  phone: [480, 900],    // bars 9-15  1 of 3: Maria clocks in on her phone; after her shift, clocks out, the day's hours
  hours: [900, 1560],   // bars 16-26 2 of 3: the week's Timecards added up, a correction approved, the week approved, saved for payroll
  tips: [1560, 2280],   // bars 27-38 3 of 3: the card tips in from Square, the jar counted, shared out by hours worked
  recap: [2280, 2640],  // bars 39-44 Maria's tips on her phone, and what the owner gets
  end: [2640, 2880],    // bars 45-48 the brand
} as const

export const HOURS_TOTAL = 2880

export type HoursScene = keyof typeof HOURS
export const lenOf = (k: HoursScene) => HOURS[k][1] - HOURS[k][0]
