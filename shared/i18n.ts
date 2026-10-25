// The languages the app can be shown in. English is the source: every piece of text is written in
// English in the code and that English is its own key, so there are no message ids to keep up.
// Spanish lives in src/i18n/es/ and a unit test (src/i18n/i18n.test.ts) fails when any text on
// screen has no Spanish, so a new page can't go out half translated.
export type Language = 'en' | 'es'

export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
]

/**
 * Marks text that is defined in one place (a list of options, a catalogue shared with the Worker)
 * and translated where it is shown, with t(). It returns the English unchanged; the test collects it.
 */
export const msg = <S extends string>(text: S): S => text
