// The folder the app makes in each business's Google Drive or OneDrive and keeps everything under
// (documents, tax files, photos, camera clips, exports). The apps' drive.file / app-folder access only
// reaches what the app made there.

export const APP_FOLDER = 'The Business Agent'

/**
 * Its name until November 2026. A folder still called this is renamed to APP_FOLDER the first time
 * the app opens it, or that night's connection check (worker/providers google.ts and microsoft.ts):
 * the same folder, so every file in it and every link to one keeps working.
 */
export const OLD_APP_FOLDER = 'Business Agent'
