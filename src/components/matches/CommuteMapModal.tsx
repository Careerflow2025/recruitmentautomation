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
  embedded?: boolean; // New prop for embedded mode (no modal wrapper)
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
  embedded = false, // Default to false (full modal mode)
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
  const [routeDetailsCollapsed, setRouteDetailsCollapsed] = useState(false);
  const [turnByTurnCollapsed, setTurnByTurnCollapsed] = useState(true); // Closed by default

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

              // Zoom out by 25% for better overview
              const boundsListener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
                const currentZoom = map.getZoom();
                if (currentZoom) {
                  // Reduce zoom by 25% (zoom out)
                  const newZoom = Math.max(3, currentZoom - (currentZoom * 0.25));
                  map.setZoom(newZoom);
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

  // Embedded mode: render just the map without modal wrapper
  if (embedded) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden bg-white">
        {/* Just the map, no header/footer */}
        <div className="flex-1 relative">
          {mapError ? (
            <div className="flex items-center justify-center h-full bg-red-50">
              <div className="text-center p-6">
                <p className="text-red-800 font-bold mb-2">⚠️ Map Error</p>
                <p className="text-red-600 text-sm">{mapError}</p>
              </div>
            </div>
          ) : (
            <>
              <div ref={mapRef} className="w-full h-full" />
              {isLoadingRoute && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto mb-2"></div>
                    <p className="text-xs text-gray-600">Loading...</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Full modal mode (original behavior)
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[95vh] overflow-hidden flex flex-col">
          {/* Clean Modern Header */}
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="text-blue-600">🗺️</span>
                  <span>Route Comparison</span>
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg p-1.5 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Compact Route Info Card */}
          <div className="flex-shrink-0 bg-white px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
              {/* Candidate Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-2xl flex-shrink-0">📍</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{candidateName}</p>
                  <p className="text-xs text-gray-600">{originPostcode}</p>
                </div>
              </div>

              {/* Driving Route */}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-lg">🚗</span>
                <div>
                  {routeInfo ? (
                    <>
                      <p className="text-sm font-bold text-blue-900">{routeInfo.duration}</p>
                      <p className="text-xs text-gray-600">{routeInfo.distance}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Loading...</p>
                  )}
                </div>
              </div>

              {/* Public Transport Route */}
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                <span className="text-lg">🚆</span>
                <div>
                  {transitRouteInfo ? (
                    <>
                      <p className="text-sm font-bold text-green-900">{transitRouteInfo.duration}</p>
                      <p className="text-xs text-gray-600">{transitRouteInfo.distance}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Loading...</p>
                  )}
                </div>
              </div>

              {/* Client Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0 text-right">
                  <p className="text-sm font-semibold text-gray-900 truncate">{clientName}</p>
                  <p className="text-xs text-gray-600">{destinationPostcode}</p>
                </div>
                <span className="text-2xl flex-shrink-0">🏥</span>
              </div>
            </div>

            {/* Route Legend */}
            <div className="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 bg-blue-600 rounded"></div>
                <span className="text-xs text-gray-600">Driving</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 bg-green-600 rounded"></div>
                <span className="text-xs text-gray-600">Public Transport</span>
              </div>
            </div>

            {/* Approximate Location Warning (if needed) */}
            {usingApproximate && (
              <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="text-sm">⚠️</span>
                <p className="text-xs text-yellow-800">Using approximate areas for route calculation</p>
              </div>
            )}
          </div>

          {/* Map Container - Full Width and Flexible */}
          <div className="flex-1 flex overflow-hidden">
            {/* Google Map - Edge to Edge */}
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
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600 mx-auto mb-4"></div>
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

          {/* Footer with Turn-by-Turn Directions - Collapsible */}
          <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200">
            {/* Turn-by-Turn Directions Header - Collapsible */}
            <div
              className="px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 cursor-pointer hover:from-slate-500 hover:to-slate-600 transition-all duration-200 flex items-center justify-between"
              onClick={() => setTurnByTurnCollapsed(!turnByTurnCollapsed)}
            >
              <h3 className="text-white font-bold flex items-center gap-2 select-none">
                <span className="text-xl">🗺️</span>
                <span>Turn-by-Turn Directions</span>
              </h3>
              <span className="text-white text-sm transition-transform duration-200" style={{ transform: turnByTurnCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </div>

            {/* Directions Content - Collapsible */}
            {!turnByTurnCollapsed && (
              <div className="bg-white">
                {/* Tabs for Driving/Transit */}
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setActiveTab('driving')}
                    className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
                      activeTab === 'driving'
                        ? 'bg-slate-50 text-slate-700 border-b-2 border-slate-600'
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
                        ? 'bg-slate-50 text-slate-700 border-b-2 border-slate-600'
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
                <div className="px-6 py-4 max-h-64 overflow-y-auto">
                  {activeTab === 'driving' ? (
                    <div
                      ref={directionsPanel}
                      className="directions-panel text-sm"
                      style={{
                        lineHeight: '1.4',
                      }}
                    />
                  ) : (
                    <div
                      ref={transitDirectionsPanel}
                      className="directions-panel text-sm"
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
                  color: #475569;
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
            )}
          </div>
        </div>
      </div>
    </>
  );
}
