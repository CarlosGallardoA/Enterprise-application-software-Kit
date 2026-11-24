export interface IncidentsPort {
  list(): Promise<string[]>;
}
