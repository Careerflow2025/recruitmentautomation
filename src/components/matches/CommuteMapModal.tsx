'use client';

import { useEffect, useState, useRef } from 'react';

interface CommuteMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  originPostcode: string;
  destinationPostcode: string;
  candidateName: string;
  clientName: string;
  commuteMinutes: number;
  commuteDisplay: string;
}

export function CommuteMapModal({
  isOpen,
  onClose,
  originPostcode,
  destinationPostcode,
  candidateName,
  clientName,
  commuteMinutes,
  commuteDisplay,
}: CommuteMapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const directionsPanel = useRef<HTMLDivElement>(null);
  const transitDirectionsPanel = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{distance: string; duration: string} | null>(null);
  const [transitRouteInfo, setTransitRouteInfo] = useState<{distance: string; duration: string} | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(true);
  const [usingApproximate, setUsingApproximate] = useState(false);
  const [activeTab, setActiveTab] = useState<'driving' | 'transit'>('driving');

  useEffect(() => {
    if (!isOpen || !mapRef.current) return;

    setIsLoadingRoute(true);
    setMapError(null);
    setRouteInfo(null);
    setTransitRouteInfo(null);
    setUsingApproximate(false);

    let map: google.maps.Map | null = null;
    let drivingRenderer: google.maps.DirectionsRenderer | null = null;
    let transitRenderer: google.maps.DirectionsRenderer | null = null;

    // Load Google Maps JavaScript API
    const loadGoogleMaps = () => {
      // Check if already loaded
      if (window.google && window.google.maps) {
        console.log('Google Maps already loaded');
        initializeMap();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        console.log('Google Maps script already exists, waiting for load...');
        existingScript.addEventListener('load', initializeMap);
        return;
      }

      console.log('Loading Google Maps script...');
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('Google Maps script loaded successfully');
        initializeMap();
      };
      script.onerror = () => {
        console.error('Failed to load Google Maps script');
        setMapError('Failed to load Google Maps');
      };
      document.head.appendChild(script);
    };

    const initializeMap = () => {
      if (!mapRef.current || !window.google) {
        console.error('Map ref or Google Maps not available');
        return;
      }

      try {
        console.log('Initializing map with origin:', originPostcode, 'destination:', destinationPostcode);

        // Create map
        map = new google.maps.Map(mapRef.current, {
          zoom: 4,
          center: { lat: 51.5074, lng: -0.1278 }, // Default to London
          mapTypeControl: true,
          fullscreenControl: true,
          streetViewControl: true,
        });

        console.log('Map created successfully');

        // Create directions service and renderers
        const directionsService = new google.maps.DirectionsService();

        // Driving route renderer (blue)
        drivingRenderer = new google.maps.DirectionsRenderer({
          map: map,
          panel: directionsPanel.current || undefined,
          suppressMarkers: false,
          polylineOptions: {
            strokeColor: '#2563eb', // Blue for driving
            strokeWeight: 6,
            strokeOpacity: 0.7,
          },
          markerOptions: {
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#2563eb',
              fillOpacity: 0.9,
              strokeColor: 'white',
              strokeWeight: 2,
            }
          }
        });

        // Transit route renderer (green)
        transitRenderer = new google.maps.DirectionsRenderer({
          map: map,
          panel: transitDirectionsPanel.current || undefined,
          suppressMarkers: true, // Hide default markers to avoid duplication
          polylineOptions: {
            strokeColor: '#10b981', // Green for transit
            strokeWeight: 5,
            strokeOpacity: 0.6,
          },
        });

        console.log('Both DirectionsRenderers created');

        // Helper function to get postcode district (first 3-4 chars)
        const getPostcodeDistrict = (postcode: string): string => {
          // Remove spaces and get outward code (district)
          const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
          // UK postcode districts are typically 2-4 characters (e.g., "SW1", "EC1A", "W1A")
          const match = cleaned.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)/);
          return match ? match[1] : cleaned.substring(0, 4);
        };

        // Try exact postcodes first, then fallback to districts
        const tryDirections = (origin: string, dest: string, isRetry = false) => {
          // Request driving directions with EXACT same parameters as Distance Matrix API
          const drivingRequest: google.maps.DirectionsRequest = {
            origin: origin + ', UK',
            destination: dest + ', UK',
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.IMPERIAL, // Match Distance Matrix API units
            avoidHighways: false, // No restrictions - exactly matches Distance Matrix API (avoid: '')
            avoidTolls: false, // No restrictions - exactly matches Distance Matrix API (avoid: '')
            avoidFerries: false, // No restrictions - exactly matches Distance Matrix API (avoid: '')
            optimizeWaypoints: false, // Direct route only
            provideRouteAlternatives: false, // Single route like Distance Matrix API
            drivingOptions: {
              departureTime: new Date(), // Current time - exactly matches Distance Matrix API (departure_time: 'now')
              trafficModel: google.maps.TrafficModel.BEST_GUESS, // Exactly matches Distance Matrix API (traffic_model: 'best_guess')
            }
          };

          // Request transit directions
          const transitRequest: google.maps.DirectionsRequest = {
            origin: origin + ', UK',
            destination: dest + ', UK',
            travelMode: google.maps.TravelMode.TRANSIT,
          };

          console.log(`Requesting driving and transit directions from ${origin} to ${dest}...`);

          // Fetch driving route
          directionsService.route(drivingRequest, (result, status) => {
            console.log('Directions response:', status, result);
            setIsLoadingRoute(false);

            if (status === 'OK' && result) {
            console.log('Driving directions OK, rendering route');
            drivingRenderer?.setDirections(result);

            // Automatically fit the map bounds to show the entire route
            if (result.routes[0] && result.routes[0].bounds && map) {
              map.fitBounds(result.routes[0].bounds);
              
              // Add some padding to the bounds for better visualization
              const boundsListener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
                const currentZoom = map.getZoom();
                if (currentZoom && currentZoom > 6) {
                  map.setZoom(6); // Cap the zoom level to prevent over-zooming
                }
              });
            }

            // Extract route information
            const route = result.routes[0];
            if (route && route.legs[0]) {
              const info = {
                distance: route.legs[0].distance?.text || 'N/A',
                duration: route.legs[0].duration?.text || 'N/A',
              };
              console.log('Route info:', info);
              setRouteInfo(info);

              // Add custom info window on the route showing duration
              try {
                // Get midpoint of the route for info window
                const path = route.overview_path || route.legs[0].steps[Math.floor(route.legs[0].steps.length / 2)].path;
                if (path && path.length > 0) {
                  const midpoint = Math.floor(path.length / 2);
                  const infoWindowPosition = path[midpoint];

                  const infoWindow = new google.maps.InfoWindow({
                    position: infoWindowPosition,
                    content: `
                      <div style="
                        padding: 8px 12px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        font-family: Arial, sans-serif;
                      ">
                        <div style="
                          display: flex;
                          align-items: center;
                          gap: 8px;
                        ">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                          </svg>
                          <div>
                            <div style="
                              font-size: 16px;
                              font-weight: bold;
                              color: #1f2937;
                            ">${info.duration}</div>
                            <div style="
                              font-size: 12px;
                              color: #6b7280;
                            ">${info.distance}</div>
                          </div>
                        </div>
                      </div>
                    `,
                  });

                  infoWindow.open(map);
                }
              } catch (infoError) {
                console.error('Error creating info window:', infoError);
                // Continue anyway - route will still show
              }
            }
          } else {
            console.error('Directions request failed:', status);

            // If NOT_FOUND and this is not a retry, try with postcode districts
            if ((status === 'NOT_FOUND' || status === 'ZERO_RESULTS') && !isRetry) {
              console.log('Exact postcodes failed, retrying with postcode districts...');
              const originDistrict = getPostcodeDistrict(origin);
              const destDistrict = getPostcodeDistrict(dest);
              console.log(`Fallback: ${originDistrict} -> ${destDistrict}`);

              // Show info that we're using approximate location
              setUsingApproximate(true);
              setRouteInfo({
                distance: 'Calculating...',
                duration: 'Using approximate areas'
              });

              tryDirections(originDistrict, destDistrict, true);
              return;
            }

            // If still failing after retry, show error with fallback markers
            setIsLoadingRoute(false);

            // Provide specific error messages based on status
            let errorMessage = '';
            switch (status) {
              case 'NOT_FOUND':
                errorMessage = isRetry
                  ? `Cannot find route using approximate areas (${origin} to ${dest}). Postcodes may be invalid.`
                  : `Cannot find exact route. Tried approximate area match but still failed.`;
                break;
              case 'ZERO_RESULTS':
                errorMessage = `No driving route found between ${origin} and ${dest}.`;
                break;
              case 'OVER_QUERY_LIMIT':
                errorMessage = 'Google Maps API quota exceeded. Please try again later.';
                break;
              case 'REQUEST_DENIED':
                errorMessage = 'Google Maps API request denied. Check API key configuration.';
                break;
              case 'INVALID_REQUEST':
                errorMessage = 'Invalid request. Please check the postcodes are correctly formatted.';
                break;
              default:
                errorMessage = `Directions request failed: ${status}`;
            }

            setMapError(errorMessage);

            // Still show the map with markers at approximate locations
            // Try to geocode the postcodes to show them on the map
            const geocoder = new google.maps.Geocoder();
            const bounds = new google.maps.LatLngBounds();
            let markersPlaced = 0;

            geocoder.geocode({ address: origin + ', UK' }, (results, geoStatus) => {
              if (geoStatus === 'OK' && results && results[0] && map) {
                new google.maps.Marker({
                  map: map,
                  position: results[0].geometry.location,
                  label: 'A',
                  title: `Origin: ${origin}`,
                });

                bounds.extend(results[0].geometry.location);
                markersPlaced++;
                
                // If both markers are placed, fit bounds to show both
                if (markersPlaced === 2) {
                  map.fitBounds(bounds);
                }
              }
            });

            geocoder.geocode({ address: dest + ', UK' }, (results, geoStatus) => {
              if (geoStatus === 'OK' && results && results[0] && map) {
                new google.maps.Marker({
                  map: map,
                  position: results[0].geometry.location,
                  label: 'B',
                  title: `Destination: ${dest}`,
                });

                bounds.extend(results[0].geometry.location);
                markersPlaced++;
                
                // If both markers are placed, fit bounds to show both
                if (markersPlaced === 2) {
                  map.fitBounds(bounds);
                } else if (markersPlaced === 1) {
                  // If only one marker could be placed, center on it
                  map.setCenter(results[0].geometry.location);
                  map.setZoom(5);
                }
              }
            });
          }
        });

          // Fetch transit route (runs in parallel)
          directionsService.route(transitRequest, (result, status) => {
            console.log('Transit directions response:', status);

            if (status === 'OK' && result) {
              console.log('Transit directions OK, rendering route');
              transitRenderer?.setDirections(result);

              // Extract transit route information
              const route = result.routes[0];
              if (route && route.legs[0]) {
                const info = {
                  distance: route.legs[0].distance?.text || 'N/A',
                  duration: route.legs[0].duration?.text || 'N/A',
                };
                console.log('Transit route info:', info);
                setTransitRouteInfo(info);
              }
            } else {
              console.log('Transit not available for this route');
              setTransitRouteInfo({
                distance: 'N/A',
                duration: 'Not available'
              });
            }
          });
        };

        // Start with exact postcodes
        tryDirections(originPostcode, destinationPostcode, false);

      } catch (error) {
        console.error('Error initializing map:', error);
        setMapError('Error initializing map');
      }
    };

    loadGoogleMaps();

    // Cleanup
    return () => {
      if (drivingRenderer) {
        drivingRenderer.setMap(null);
      }
      if (transitRenderer) {
        transitRenderer.setMap(null);
      }
    };
  }, [isOpen, originPostcode, destinationPostcode]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">🗺️ Route Visualization</h2>
                <p className="text-blue-100 text-sm mt-1">Google Maps Driving Directions</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Journey Info */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            {/* Time Difference Notice */}
            <div className="mb-3 bg-blue-50 border border-blue-300 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">ℹ️</span>
                <p className="text-sm font-semibold text-blue-900">Google Maps API Configuration</p>
              </div>
              <p className="text-xs text-blue-700">
                Both the database matching system and live map use Google Maps APIs with identical parameters: 
                driving mode, traffic_model: 'best_guess', departure_time: 'now', no route restrictions, imperial units.
                Small differences are due to the timing of API calls and real-time traffic changes.
              </p>
            </div>

            {usingApproximate && (
              <div className="mb-3 bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-yellow-900">Using Approximate Areas</p>
                  <p className="text-xs text-yellow-700">
                    Exact postcodes not found. Showing route between general areas for estimation.
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Origin */}
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">📍</span>
                  <span className="text-xs font-semibold text-green-600 uppercase">Origin</span>
                </div>
                <p className="font-bold text-gray-900">{candidateName}</p>
                <p className="text-sm text-gray-600">{originPostcode}</p>
              </div>

              {/* Commute Time (Database) */}
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">💾</span>
                  <span className="text-xs font-semibold text-blue-600 uppercase">Database (Used for Matching)</span>
                </div>
                <p className="font-bold text-2xl text-blue-900">{commuteMinutes} min</p>
                <p className="text-sm text-gray-600">{commuteDisplay}</p>
                <p className="text-xs text-gray-500 mt-1">From Google Maps Distance Matrix API</p>
              </div>

              {/* Live Driving Route Info */}
              <div className="bg-white rounded-lg p-3 border border-green-300">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🔄</span>
                  <span className="text-xs font-semibold text-green-700 uppercase">Live Route (Current Traffic)</span>
                </div>
                {routeInfo ? (
                  <>
                    <p className="font-bold text-lg text-green-900">{routeInfo.duration}</p>
                    <p className="text-sm text-gray-600">{routeInfo.distance}</p>
                    <p className="text-xs text-gray-500 mt-1">From Google Maps Directions API</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-lg text-gray-400">Calculating...</p>
                    <p className="text-sm text-gray-400">Please wait</p>
                  </>
                )}
              </div>

              {/* Live Transit Route Info */}
              <div className="bg-white rounded-lg p-3 border border-purple-300">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🚆</span>
                  <span className="text-xs font-semibold text-purple-700 uppercase">Public Transport</span>
                </div>
                {transitRouteInfo ? (
                  <>
                    <p className="font-bold text-lg text-purple-900">{transitRouteInfo.duration}</p>
                    <p className="text-sm text-gray-600">{transitRouteInfo.distance}</p>
                    <p className="text-xs text-gray-500 mt-1">Live Google Maps transit route</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-lg text-gray-400">Calculating...</p>
                    <p className="text-sm text-gray-400">Please wait</p>
                  </>
                )}
              </div>

              {/* Destination */}
              <div className="bg-white rounded-lg p-3 border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🏥</span>
                  <span className="text-xs font-semibold text-red-600 uppercase">Destination</span>
                </div>
                <p className="font-bold text-gray-900">{clientName}</p>
                <p className="text-sm text-gray-600">{destinationPostcode}</p>
              </div>
            </div>
          </div>

          {/* Map and Directions Container */}
          <div className="flex" style={{ height: '500px' }}>
            {/* Turn-by-Turn Directions Panel */}
            <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('driving')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
                    activeTab === 'driving'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>🚗</span>
                    <span>Driving</span>
                  </div>
                  {routeInfo && (
                    <p className="text-xs mt-1">{routeInfo.duration}</p>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('transit')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
                    activeTab === 'transit'
                      ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>🚆</span>
                    <span>Transit</span>
                  </div>
                  {transitRouteInfo && transitRouteInfo.duration !== 'Not available' && (
                    <p className="text-xs mt-1">{transitRouteInfo.duration}</p>
                  )}
                </button>
              </div>

              {/* Directions Panel Content */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'driving' ? (
                  <div
                    ref={directionsPanel}
                    className="directions-panel px-4 py-2 text-sm"
                    style={{
                      lineHeight: '1.4',
                    }}
                  />
                ) : (
                  <div
                    ref={transitDirectionsPanel}
                    className="directions-panel px-4 py-2 text-sm"
                    style={{
                      lineHeight: '1.4',
                    }}
                  />
                )}
              </div>

              <style jsx>{`
                .directions-panel :global(table) {
                  width: 100%;
                  border-collapse: collapse;
                }
                .directions-panel :global(tr) {
                  transition: background-color 0.2s;
                }
                .directions-panel :global(tr:hover) {
                  background-color: #f9fafb;
                }
                .directions-panel :global(td) {
                  padding: 12px 8px;
                  border-bottom: 1px solid #e5e7eb;
                  vertical-align: top;
                }
                .directions-panel :global(td:first-child) {
                  width: 40px;
                  text-align: center;
                  font-weight: bold;
                  color: #2563eb;
                  font-size: 14px;
                }
                .directions-panel :global(img) {
                  display: inline-block;
                  vertical-align: middle;
                  margin-right: 4px;
                }
                .directions-panel :global(b) {
                  color: #1f2937;
                  font-weight: 600;
                  font-size: 13px;
                }
                .directions-panel :global(.adp-substep) {
                  margin-left: 20px;
                  padding-left: 10px;
                  border-left: 2px solid #e5e7eb;
                  margin-top: 4px;
                }
                .directions-panel :global(.adp-placemark) {
                  color: #6b7280;
                  font-size: 12px;
                  margin-top: 2px;
                }
                .directions-panel :global(div) {
                  line-height: 1.5;
                }
              `}</style>
            </div>

            {/* Google Map */}
            <div className="flex-1 relative">
              {mapError ? (
                <div className="flex items-center justify-center h-full bg-red-50">
                  <div className="text-center p-6">
                    <p className="text-red-800 font-bold mb-2">⚠️ Map Error</p>
                    <p className="text-red-600 text-sm">{mapError}</p>
                    <p className="text-xs text-gray-600 mt-4">
                      Check browser console (F12) for detailed error messages
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div ref={mapRef} className="w-full h-full" />
                  {isLoadingRoute && (
                    <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-900 font-medium">Calculating route...</p>
                        <p className="text-sm text-gray-600 mt-1">
                          From {originPostcode} to {destinationPostcode}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-600 rounded"></div>
                <span>🚗 Driving (Live)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-purple-600 rounded"></div>
                <span>🚆 Transit (Live)</span>
              </div>
              <span className="text-xs text-gray-500">All routes use Google Maps APIs with identical parameters</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
