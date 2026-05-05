
import { Waypoint } from './types';

export const AP1_INITIAL_WAYPOINTS: Waypoint[] = [
  { lat: 42.9436, lng: -2.6315, pk: 102.0, isFixed: true },
  { lat: 42.9644, lng: -2.6178, pk: 105.0, isFixed: false },
  { lat: 42.9845, lng: -2.6111, pk: 108.0, isFixed: true },
  { lat: 43.0125, lng: -2.5954, pk: 113.0, isFixed: false },
  { lat: 43.0312, lng: -2.5745, pk: 117.0, isFixed: true },
  { lat: 43.0487, lng: -2.5421, pk: 121.0, isFixed: false },
  { lat: 43.0612, lng: -2.5156, pk: 124.0, isFixed: true },
  { lat: 43.0855, lng: -2.4822, pk: 130.5, isFixed: true },
  { lat: 43.1124, lng: -2.4744, pk: 134.0, isFixed: false },
  { lat: 43.1412, lng: -2.4633, pk: 138.5, isFixed: true },
  { lat: 43.1611, lng: -2.4555, pk: 142.0, isFixed: false },
  { lat: 43.1782, lng: -2.4431, pk: 145.8, isFixed: true }
];

export const AP636_INITIAL_WAYPOINTS: Waypoint[] = [
  { lat: 43.0535, lng: -2.2132, pk: 0.000, isFixed: true },
  { lat: 43.0454, lng: -2.2531, pk: 3.450, isFixed: true },
  { lat: 43.0641, lng: -2.2852, pk: 6.650, isFixed: true },
  { lat: 43.0852, lng: -2.3164, pk: 10.100, isFixed: true },
  { lat: 43.1012, lng: -2.3685, pk: 15.350, isFixed: true },
  { lat: 43.1124, lng: -2.3982, pk: 21.250, isFixed: true },
  { lat: 43.1165, lng: -2.4174, pk: 22.950, isFixed: true }
];

export const ROADS = [
  { id: 'ap1', name: 'AP-1', description: 'Luko - Eibar' },
  { id: 'ap636', name: 'AP-636', description: 'Beasain - Bergara' }
];
