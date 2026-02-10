export namespace Update {
  /**
   * Miliseconds
   */
  export const CheckInterval = 24 * 60 * 60 * 1000;

  export const Repo = process.env.ARCHIVER_GITHUB_REPO ?? 'aldia/archiver';

  /**
   * Miliseconds
   */
  export const Timeout = 10_000;
}
