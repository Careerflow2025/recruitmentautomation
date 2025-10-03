// Google Maps JavaScript API type definitions
interface Window {
  google: typeof google;
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(element: HTMLElement, opts?: MapOptions);
    }

    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeControl?: boolean;
      fullscreenControl?: boolean;
      streetViewControl?: boolean;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    class LatLng {
      constructor(lat: number, lng: number);
    }

    class DirectionsService {
      route(
        request: DirectionsRequest,
        callback: (result: DirectionsResult | null, status: DirectionsStatus) => void
      ): void;
    }

    class DirectionsRenderer {
      constructor(opts?: DirectionsRendererOptions);
      setDirections(directions: DirectionsResult): void;
      setMap(map: Map | null): void;
    }

    interface DirectionsRendererOptions {
      map?: Map;
      suppressMarkers?: boolean;
      polylineOptions?: PolylineOptions;
    }

    interface PolylineOptions {
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
    }

    interface DirectionsRequest {
      origin: string | LatLng | LatLngLiteral;
      destination: string | LatLng | LatLngLiteral;
      travelMode: TravelMode;
    }

    interface DirectionsResult {
      routes: DirectionsRoute[];
    }

    interface DirectionsRoute {
      legs: DirectionsLeg[];
    }

    interface DirectionsLeg {
      distance?: { text: string; value: number };
      duration?: { text: string; value: number };
    }

    enum TravelMode {
      DRIVING = 'DRIVING',
      WALKING = 'WALKING',
      BICYCLING = 'BICYCLING',
      TRANSIT = 'TRANSIT',
    }

    type DirectionsStatus =
      | 'OK'
      | 'NOT_FOUND'
      | 'ZERO_RESULTS'
      | 'MAX_WAYPOINTS_EXCEEDED'
      | 'INVALID_REQUEST'
      | 'OVER_QUERY_LIMIT'
      | 'REQUEST_DENIED'
      | 'UNKNOWN_ERROR';
  }
}
