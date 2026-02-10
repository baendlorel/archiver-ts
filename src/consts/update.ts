export namespace Update {
  export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  export const REPO = process.env.ARCHIVER_GITHUB_REPO ?? 'aldia/archiver';
  export const TIMEOUT_MS = 10_000;
}
