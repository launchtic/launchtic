// Thrown by @launchtic/ee functions for expected, HTTP-status-bearing
// failures (plan gate denied, not found, conflict, ...). Callers in
// apps/web catch this specifically and translate status→err(), falling
// back to the generic handleError() for anything unexpected.
export class EeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
