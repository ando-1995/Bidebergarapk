
export interface Waypoint {
  lat: number;
  lng: number;
  pk: number;
  label?: string;
  isFixed?: boolean; // Indica si el usuario ha definido este PK manualmente
}

export interface PKResult {
  pk: number;
  accuracy: number;
  timestamp: number;
  lat: number;
  lng: number;
  distanceToRoad: number; 
}

export interface IncidentLog {
  id: string;
  pk: string;
  timestamp: number;
  lat: number;
  lng: number;
  description?: string;
}
