import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  PanResponder,
} from 'react-native';
import * as Location from 'expo-location';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Svg, { Path as SvgPath, Polyline as SvgPolyline } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export * from './meetingPlaceMap.shared';

import {
  ELSALVADOR_CITY_CENTER,
  getElSalvadorCityOutline,
  getElSalvadorCityRegion,
  isInsideElSalvadorCity,
  type MeetingCoordinate,
  type MeetingPlaceMapProps,
} from './meetingPlaceMap.shared';
import {
  buildMapboxStaticUrl,
  coordinateToPixel,
  fetchMapboxDrivingPath,
  clampMapZoom,
  getVisibleMapboxTiles,
  hasMapboxToken,
  pixelToCoordinate,
  zoomToFitCoordinates,
  type MapboxBasemapStyle,
} from '@/utils/mapbox';

// Diri himuon ang SVG path gikan sa mga punto.
function polylinePath(points: Array<{ x: number; y: number }>, close = false): string {
  if (points.length < 2) return '';
  const commands = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`);
  if (close) commands.push('Z');
  return commands.join(' ');
}

// Diri sukdon ang gilay-on sa duha ka tudlo.
function touchDistance(touches: Array<{ pageX: number; pageY: number }>): number {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

// Diri kuhaon ang tunga sa mga tudlo sa screen.
function touchCentroid(touches: Array<{ locationX: number; locationY: number }>): { x: number; y: number } {
  const total = touches.reduce(
    (sum, touch) => ({ x: sum.x + touch.locationX, y: sum.y + touch.locationY }),
    { x: 0, y: 0 }
  );
  return { x: total.x / touches.length, y: total.y / touches.length };
}

// Diri sukdon ang gilay-on sa duha ka lugar.
function distanceMeters(from: MeetingCoordinate, to: MeetingCoordinate) {
  // Diri i-convert ang degrees ngadto sa radians.
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRad(to.latitude - from.latitude);
  const longitudeDelta = toRad(to.longitude - from.longitude);
  const fromLatitude = toRad(from.latitude);
  const toLatitude = toRad(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

// Diri ang mapa para sa meeting place.
function MeetingPlaceMapComponent({
  coordinate,
  onCoordinateChange,
  editable = false,
  height = 220,
  showUserLocation = true,
  markerTitle = 'MEETING PLACE',
  additionalMarkers = [],
  autoDetectGps,
  allowMapMarking = false,
  restrictToCityBounds = false,
  showRouteLine = false,
  showGpsButton,
  focusCoordinate = null,
  focusZoom,
  snapZoom,
  markerLabel = '',
  onBasemapSettled,
}: MeetingPlaceMapProps) {
  const shouldAutoDetect = autoDetectGps === true;
  const canMarkOnMap = editable && allowMapMarking;
  const canUseGpsButton = showGpsButton ?? (shouldAutoDetect || canMarkOnMap);
  const followedPlaceRef = useRef('');
  const cityRegion = useMemo(() => getElSalvadorCityRegion(), []);
  const cityOutline = useMemo(() => getElSalvadorCityOutline(), []);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [locating, setLocating] = useState(shouldAutoDetect || showRouteLine);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [userCoordinate, setUserCoordinate] = useState<MeetingCoordinate | null>(null);
  const [outsideCity, setOutsideCity] = useState(false);
  const [layout, setLayout] = useState({ width: 0, height });
  const [zoom, setZoom] = useState(() =>
    coordinate
      ? clampMapZoom(snapZoom ?? focusZoom ?? 19)
      : (focusZoom ?? (restrictToCityBounds ? (allowMapMarking ? 16 : 15) : 16))
  );
  const [mapStyle, setMapStyle] = useState<MapboxBasemapStyle>('streets');
  const [mapCenter, setMapCenter] = useState<MeetingCoordinate>(() =>
    coordinate
    || focusCoordinate
    || (restrictToCityBounds
      ? { latitude: cityRegion.latitude, longitude: cityRegion.longitude }
      : ELSALVADOR_CITY_CENTER)
  );
  const [routePath, setRoutePath] = useState<MeetingCoordinate[]>([]);
  const [loadOffset, setLoadOffset] = useState({ x: 0, y: 0 });
  const [cameraLocked, setCameraLocked] = useState(true);
  const cameraLockedRef = useRef(true);
  const autoDetectedRef = useRef(false);
  const fittedRouteRef = useRef(false);
  const skipNextFollowRef = useRef(false);
  const grantPointRef = useRef({ x: 0, y: 0 });
  const grantPageRef = useRef({ x: 0, y: 0 });
  const travelRef = useRef(0);
  const pinchStartDistRef = useRef(1);
  const pinchStartScaleRef = useRef(1);
  const pinchLayerRef = useRef({ x: 0, y: 0 });
  const pinchingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, gx: 0, gy: 0 });
  const handleMapPressRef = useRef<(x: number, y: number) => void>(() => {});
  const commitCameraRef = useRef<() => void>(() => {});
  const layoutRef = useRef(layout);
  const centerRef = useRef(mapCenter);
  const zoomRef = useRef(zoom);
  const onCoordinateChangeRef = useRef(onCoordinateChange);
  const onBasemapSettledRef = useRef(onBasemapSettled);
  const mapSurfaceRef = useRef<View>(null);
  const tileSourcesRef = useRef(new Map<string, { uri: string }>());
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scaleSV = useSharedValue(1);
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const didPinchRef = useRef(false);
  const rebaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  layoutRef.current = layout;
  centerRef.current = mapCenter;
  zoomRef.current = zoom;
  onCoordinateChangeRef.current = onCoordinateChange;
  onBasemapSettledRef.current = onBasemapSettled;

  const mapLayerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scaleSV.value },
    ],
  }));

  // Diri i-apply ang posisyon ug zoom sa camera.
  const applyCamera = useCallback(
    (x: number, y: number, scale: number) => {
      cameraRef.current = { x, y, scale };
      translateX.value = x;
      translateY.value = y;
      scaleSV.value = scale;
    },
    [scaleSV, translateX, translateY]
  );

  // Diri i-reset ang camera sa mapa.
  const resetCamera = useCallback(() => {
    applyCamera(0, 0, 1);
    setLoadOffset({ x: 0, y: 0 });
    cameraLockedRef.current = true;
    setCameraLocked(true);
  }, [applyCamera]);

  // Diri i-convert ang tuldok sa screen ngadto sa coordinates.
  const screenToCoordinate = useCallback(
    (locationX: number, locationY: number) => {
      const currentLayout = layoutRef.current;
      const currentScale = cameraRef.current.scale || 1;
      const layerX =
        (locationX - currentLayout.width / 2 - cameraRef.current.x) / currentScale + currentLayout.width / 2;
      const layerY =
        (locationY - currentLayout.height / 2 - cameraRef.current.y) / currentScale + currentLayout.height / 2;
      return pixelToCoordinate(
        layerX,
        layerY,
        currentLayout.width,
        currentLayout.height,
        centerRef.current,
        zoomRef.current
      );
    },
    []
  );

  // Diri i-set ang pin ug susihon kung sulod sa siyudad.
  const applyCoordinate = useCallback((next: MeetingCoordinate) => {
    const inside = isInsideElSalvadorCity(next.latitude, next.longitude);
    setOutsideCity(!inside);
    if (!inside) {
      onCoordinateChangeRef.current?.(null);
      return false;
    }
    onCoordinateChangeRef.current?.(next);
    return true;
  }, []);

  // Diri i-rebase ang mapa sa bag-ong tiles.
  const rebaseToTiles = useCallback(() => {
    const currentLayout = layoutRef.current;
    const scale = cameraRef.current.scale || 1;
    const nextZoom = clampMapZoom(zoomRef.current + Math.log2(Math.max(0.05, scale)));
    const nextCenter =
      currentLayout.width > 0
        ? screenToCoordinate(currentLayout.width / 2, currentLayout.height / 2)
        : centerRef.current;

    applyCamera(0, 0, 1);
    setLoadOffset({ x: 0, y: 0 });
    skipNextFollowRef.current = true;
    setMapCenter(nextCenter);
    setZoom(nextZoom);
    centerRef.current = nextCenter;
    zoomRef.current = nextZoom;
  }, [applyCamera, screenToCoordinate]);

  // Diri i-save ang bag-ong center ug zoom sa mapa.
  const commitCamera = useCallback(() => {
    const scale = cameraRef.current.scale || 1;
    const x = cameraRef.current.x;
    const y = cameraRef.current.y;
    if (Math.abs(x) < 2 && Math.abs(y) < 2 && Math.abs(scale - 1) < 0.03) {
      return;
    }

    if (rebaseTimerRef.current) {
      clearTimeout(rebaseTimerRef.current);
      rebaseTimerRef.current = null;
    }

    // A small pinch only scales the tiles already on screen. New tiles load
    // after a large zoom or a long pan, so the map does not reload each time.
    const needsNewTiles = scale >= 2 || scale <= 0.5;
    const farPan = Math.abs(x) > 480 || Math.abs(y) > 480;
    if (needsNewTiles || farPan) {
      rebaseTimerRef.current = setTimeout(() => {
        rebaseTimerRef.current = null;
        rebaseToTiles();
      }, 700);
      return;
    }

    // A normal drag only slides the tiles already on screen. New tiles load after a long pan.
    if (Math.abs(x) > 220 || Math.abs(y) > 220) {
      setLoadOffset({ x, y });
    }
  }, [rebaseToTiles]);

  commitCameraRef.current = commitCamera;

  useEffect(() => {
    return () => {
      if (rebaseTimerRef.current) clearTimeout(rebaseTimerRef.current);
    };
  }, []);

  // Diri pangitaon ang lokasyon sa user.
  const locateUser = useCallback(
    async (options?: { force?: boolean }) => {
      setLocating(true);
      setGpsError(null);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setPermissionDenied(true);
          setGpsError(`Location permission is required to use GPS for your ${markerTitle.toLowerCase()}.`);
          return;
        }

        setPermissionDenied(false);

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          setGpsError('Your location is turned off. Please turn on Location / GPS in your phone settings, then try again.');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoordinate(next);

        if (shouldAutoDetect || canMarkOnMap) {
          const applied = applyCoordinate(next);
          if (applied) {
            autoDetectedRef.current = true;
            skipNextFollowRef.current = true;
            resetCamera();
            setMapCenter(next);
            setZoom(canMarkOnMap ? clampMapZoom(snapZoom ?? 19) : 17);
          } else {
            onCoordinateChangeRef.current?.(null);
            setGpsError(
              `You are outside El Salvador City. ${markerTitle} can only be pinned inside the city.`
            );
          }
        }
      } catch {
        setGpsError('Could not get your location. Please make sure Location / GPS is turned on, then try again.');
        if (!options?.force) {
          setPermissionDenied(true);
        }
      } finally {
        setLocating(false);
      }
    },
    [applyCoordinate, canMarkOnMap, markerTitle, resetCamera, shouldAutoDetect, snapZoom]
  );

  // Diri markahan ang pin kung gi-pindot ang mapa.
  const handleMapPress = useCallback(
    (locationX: number, locationY: number) => {
      if (!canMarkOnMap || layoutRef.current.width <= 0) return;
      const next = screenToCoordinate(locationX, locationY);
      const applied = applyCoordinate(next);
      skipNextFollowRef.current = true;
      if (!applied) {
        setGpsError('Tap inside the El Salvador City border only. Pins outside the city are not allowed.');
      } else {
        setGpsError(null);
      }
    },
    [applyCoordinate, canMarkOnMap, screenToCoordinate]
  );
  handleMapPressRef.current = handleMapPress;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          const layout = layoutRef.current;
          travelRef.current = 0;
          grantPageRef.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
          grantPointRef.current = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
          };
          dragStartRef.current = {
            x: cameraRef.current.x,
            y: cameraRef.current.y,
            gx: 0,
            gy: 0,
          };
          pinchingRef.current = touches.length >= 2;
          didPinchRef.current = touches.length >= 2;
          if (touches.length >= 2) {
            const focal = touchCentroid(touches);
            const scale = cameraRef.current.scale || 1;
            pinchStartDistRef.current = touchDistance(touches) || 1;
            pinchStartScaleRef.current = scale;
            pinchLayerRef.current = {
              x: (focal.x - layout.width / 2 - cameraRef.current.x) / scale + layout.width / 2,
              y: (focal.y - layout.height / 2 - cameraRef.current.y) / scale + layout.height / 2,
            };
          }
        },
        onPanResponderMove: (event, gesture) => {
          const touches = event.nativeEvent.touches;
          const layout = layoutRef.current;
          const moved = Math.hypot(
            event.nativeEvent.pageX - grantPageRef.current.x,
            event.nativeEvent.pageY - grantPageRef.current.y
          );
          if (moved > travelRef.current) travelRef.current = moved;
          if (moved > 12 && cameraLockedRef.current) {
            cameraLockedRef.current = false;
            setCameraLocked(false);
          }
          if (touches.length >= 2) {
            const distance = touchDistance(touches);
            if (!pinchingRef.current || pinchStartDistRef.current < 8) {
              const focal = touchCentroid(touches);
              const scale = cameraRef.current.scale || 1;
              pinchingRef.current = true;
              didPinchRef.current = true;
              pinchStartDistRef.current = distance || 1;
              pinchStartScaleRef.current = scale;
              pinchLayerRef.current = {
                x: (focal.x - layout.width / 2 - cameraRef.current.x) / scale + layout.width / 2,
                y: (focal.y - layout.height / 2 - cameraRef.current.y) / scale + layout.height / 2,
              };
            }
            if (distance > 0 && pinchStartDistRef.current > 0) {
              const rawScale = pinchStartScaleRef.current * (distance / pinchStartDistRef.current);
              const nextZoom = clampMapZoom(zoomRef.current + Math.log2(Math.max(0.05, rawScale)));
              const nextScale = 2 ** (nextZoom - zoomRef.current);
              const focal = touchCentroid(touches);
              const nextX = focal.x - (pinchLayerRef.current.x - layout.width / 2) * nextScale - layout.width / 2;
              const nextY = focal.y - (pinchLayerRef.current.y - layout.height / 2) * nextScale - layout.height / 2;
              applyCamera(nextX, nextY, nextScale);
            }
            return;
          }
          if (pinchingRef.current) {
            pinchingRef.current = false;
            dragStartRef.current = {
              x: cameraRef.current.x,
              y: cameraRef.current.y,
              gx: gesture.dx,
              gy: gesture.dy,
            };
          }
          const nextX = dragStartRef.current.x + (gesture.dx - dragStartRef.current.gx);
          const nextY = dragStartRef.current.y + (gesture.dy - dragStartRef.current.gy);
          applyCamera(nextX, nextY, cameraRef.current.scale || 1);
        },
        onPanResponderRelease: (event, gesture) => {
          const travel = Math.max(
            travelRef.current,
            Math.hypot(gesture.dx, gesture.dy),
            Math.hypot(
              event.nativeEvent.pageX - grantPageRef.current.x,
              event.nativeEvent.pageY - grantPageRef.current.y
            )
          );
          // A drag only moves the map. A pin is dropped only when the finger stays still.
          if (!didPinchRef.current && travel < 12) {
            const pageX = grantPageRef.current.x;
            const pageY = grantPageRef.current.y;
            const surface = mapSurfaceRef.current;
            if (!surface) {
              handleMapPressRef.current(grantPointRef.current.x, grantPointRef.current.y);
            } else {
              surface.measureInWindow((originX, originY, width, height) => {
                if (width < 8 || height < 8) return;
                layoutRef.current = { width: Math.round(width), height: Math.round(height) };
                handleMapPressRef.current(pageX - originX, pageY - originY);
              });
            }
          }
          pinchingRef.current = false;
          didPinchRef.current = false;
          travelRef.current = 0;
          commitCameraRef.current();
        },
        onPanResponderTerminate: () => {
          commitCameraRef.current();
        },
      }),
    [applyCamera]
  );

  useEffect(() => {
    if (showRouteLine || !coordinate || layout.width < 8) return;
    const placeKey = `${coordinate.latitude.toFixed(7)},${coordinate.longitude.toFixed(7)}:${snapZoom ?? ''}:${layout.width}`;
    const drifted =
      Math.abs(centerRef.current.latitude - coordinate.latitude) > 0.0000001
      || Math.abs(centerRef.current.longitude - coordinate.longitude) > 0.0000001;
    if (followedPlaceRef.current === placeKey && !drifted) return;
    followedPlaceRef.current = placeKey;
    // A tap keeps the camera still so the pin stays on the spot the finger marked.
    if (skipNextFollowRef.current) {
      skipNextFollowRef.current = false;
      return;
    }
    const nextZoom = snapZoom ? clampMapZoom(snapZoom) : zoomRef.current;
    if (!drifted && zoomRef.current === nextZoom) return;
    if (rebaseTimerRef.current) {
      clearTimeout(rebaseTimerRef.current);
      rebaseTimerRef.current = null;
    }
    resetCamera();
    setMapCenter(coordinate);
    if (snapZoom) setZoom(nextZoom);
  }, [showRouteLine, coordinate?.latitude, coordinate?.longitude, layout.width, resetCamera, snapZoom]);

  useEffect(() => {
    if (!focusCoordinate || coordinate) return;
    resetCamera();
    setMapCenter(focusCoordinate);
    setZoom(focusZoom ?? 16.5);
  }, [coordinate, focusCoordinate?.latitude, focusCoordinate?.longitude, focusZoom, resetCamera]);

  useEffect(() => {
    if (!showRouteLine || fittedRouteRef.current || !coordinate || !userCoordinate || layout.width < 8) {
      return;
    }
    fittedRouteRef.current = true;
    skipNextFollowRef.current = true;
    resetCamera();
    setMapCenter({
      latitude: (coordinate.latitude + userCoordinate.latitude) / 2,
      longitude: (coordinate.longitude + userCoordinate.longitude) / 2,
    });
    setZoom(zoomToFitCoordinates(userCoordinate, coordinate, layout.width, layout.height));
  }, [showRouteLine, coordinate, userCoordinate, layout.width, layout.height, resetCamera]);

  useEffect(() => {
    if (!shouldAutoDetect && !showUserLocation && !showRouteLine) return;
    if (shouldAutoDetect || showRouteLine) {
      locateUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoDetect]);

  useEffect(() => {
    if (!showRouteLine) return undefined;

    let subscription: Location.LocationSubscription | null = null;

    // Diri sugdan ang pag-track sa lokasyon sa user.
    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 3,
          timeInterval: 2000,
        },
        (position) => {
          setUserCoordinate({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      );
    };

    startWatching();

    return () => {
      subscription?.remove();
    };
  }, [showRouteLine]);

  useEffect(() => {
    let cancelled = false;

    // Diri kuhaon ang ruta padulong sa meeting place.
    const loadRoute = async () => {
      if (!showRouteLine || !coordinate || !userCoordinate || distanceMeters(userCoordinate, coordinate) <= 50) {
        setRoutePath([]);
        return;
      }
      const path = await fetchMapboxDrivingPath(userCoordinate, coordinate);
      if (!cancelled) setRoutePath(path);
    };

    loadRoute();
    return () => {
      cancelled = true;
    };
  }, [showRouteLine, coordinate?.latitude, coordinate?.longitude, userCoordinate?.latitude, userCoordinate?.longitude]);

  const tiles = useMemo(() => {
    if (!hasMapboxToken() || layout.width < 8) return [];
    return getVisibleMapboxTiles({
      center: mapCenter,
      zoom,
      width: layout.width,
      height: layout.height,
      style: mapStyle,
      offsetX: loadOffset.x,
      offsetY: loadOffset.y,
    });
  }, [layout.height, layout.width, loadOffset.x, loadOffset.y, mapCenter, mapStyle, zoom]);

  const overlayGeometry = useMemo(() => {
    if (layout.width < 8) return null;

    const cityPixels = restrictToCityBounds
      ? cityOutline.map((point) =>
          coordinateToPixel(point, layout.width, layout.height, mapCenter, zoom)
        )
      : [];
    const routePixels = routePath.map((point) =>
      coordinateToPixel(point, layout.width, layout.height, mapCenter, zoom)
    );
    const allPixels = [...cityPixels, ...routePixels];
    if (allPixels.length < 2) return null;

    const extraX = Math.abs(loadOffset.x) + 256;
    const extraY = Math.abs(loadOffset.y) + 256;
    const minX = -extraX;
    const minY = -extraY;
    const maxX = layout.width + extraX;
    const maxY = layout.height + extraY;

    // Diri i-adjust ang pixel base sa minimum.
    const shift = (pixel: { x: number; y: number }) => ({
      x: pixel.x - minX,
      y: pixel.y - minY,
    });

    return {
      left: minX,
      top: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      cityPath: cityPixels.length >= 4 ? polylinePath(cityPixels.map(shift), true) : '',
      routePoints: routePixels.length >= 2
        ? routePixels.map(shift).map((pixel) => `${pixel.x},${pixel.y}`).join(' ')
        : '',
    };
  }, [cityOutline, layout.height, layout.width, loadOffset.x, loadOffset.y, mapCenter, restrictToCityBounds, routePath, zoom]);

  const pins = useMemo(() => {
    if (layout.width < 8) return [];
    const next: Array<{ key: string; x: number; y: number; color: string; size: number }> = [];
    // Diri idugang ang pin sa mapa.
    const addPin = (point: MeetingCoordinate, key: string, color: string, size: number) => {
      const pixel = coordinateToPixel(point, layout.width, layout.height, mapCenter, zoom);
      next.push({ key, x: pixel.x, y: pixel.y, color, size });
    };
    if (showRouteLine && userCoordinate) {
      addPin(userCoordinate, 'you', '#0ea5e9', 26);
    }
    if (coordinate) {
      addPin(coordinate, 'meeting', '#059669', 34);
    }
    additionalMarkers.forEach((marker, index) => {
      addPin(marker, `extra-${marker.id ?? index}`, '#059669', 26);
    });
    return next;
  }, [additionalMarkers, coordinate, layout.height, layout.width, mapCenter, showRouteLine, userCoordinate, zoom]);

  const meetingPlaceReady = !!coordinate && !outsideCity;
  const mapReady = hasMapboxToken() && layout.width >= 8;
  const [basemapReady, setBasemapReady] = useState(false);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const basemapReadyRef = useRef(false);
  const tileFailRef = useRef(0);
  const previewFailedRef = useRef(false);
  const pinScale = useSharedValue(1);
  const pinSeenRef = useRef(false);
  const pinPopStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinScale.value }],
  }));
  const markBasemapReady = useCallback(() => {
    if (basemapReadyRef.current) return;
    basemapReadyRef.current = true;
    setBasemapReady(true);
    setBasemapFailed(false);
    onBasemapSettledRef.current?.();
  }, []);
  const markBasemapFailed = useCallback(() => {
    if (basemapReadyRef.current) return;
    setBasemapFailed(true);
    onBasemapSettledRef.current?.();
  }, []);
  const previewUrl = mapReady
    ? buildMapboxStaticUrl({
        center: mapCenter,
        zoom: Math.round(zoom * 2) / 2,
        width: layout.width,
        height: layout.height,
        retina: false,
        style: mapStyle,
      })
    : null;
  const tileCount = tiles.length;

  useEffect(() => {
    if (!coordinate) return;
    if (!pinSeenRef.current) {
      pinSeenRef.current = true;
      pinScale.value = 1;
      return;
    }
    pinScale.value = 0.72;
    pinScale.value = withTiming(1, { duration: 180 });
  }, [coordinate?.latitude, coordinate?.longitude, pinScale]);

  useEffect(() => {
    if (!mapReady || basemapReady) return undefined;
    const timer = setTimeout(() => {
      if (!basemapReadyRef.current) markBasemapFailed();
    }, 12000);
    return () => clearTimeout(timer);
  }, [basemapReady, mapReady, mapAttempt, markBasemapFailed]);

  const retryMap = useCallback(() => {
    basemapReadyRef.current = false;
    tileFailRef.current = 0;
    previewFailedRef.current = false;
    setBasemapReady(false);
    setBasemapFailed(false);
    setMapAttempt((attempt) => attempt + 1);
  }, []);

  const noteTileError = useCallback(() => {
    tileFailRef.current += 1;
    if (previewFailedRef.current && tileCount > 0 && tileFailRef.current >= tileCount) {
      markBasemapFailed();
    }
  }, [markBasemapFailed, tileCount]);

  const atMeetingPlace = Boolean(
    showRouteLine && coordinate && userCoordinate && distanceMeters(userCoordinate, coordinate) <= 50
  );

  return (
    <View>
      <View
        collapsable={false}
        className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600"
        style={{ height }}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          const nextHeight = Math.round(event.nativeEvent.layout.height || height);
          if (width < 8 || nextHeight < 8) return;
          setLayout((current) => (
            current.width === width && current.height === nextHeight
              ? current
              : { width, height: nextHeight }
          ));
        }}
      >
        {mapReady ? (
          <View
            ref={mapSurfaceRef}
            collapsable={false}
            {...panResponder.panHandlers}
            onLayout={(event) => {
              const width = Math.round(event.nativeEvent.layout.width);
              const nextHeight = Math.round(event.nativeEvent.layout.height);
              if (width < 8 || nextHeight < 8) return;
              setLayout((current) => (
                current.width === width && current.height === nextHeight
                  ? current
                  : { width, height: nextHeight }
              ));
            }}
            style={{ width: '100%', height: '100%', backgroundColor: '#cbd5e1' }}
          >
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: layout.width,
                    height: layout.height,
                  },
                  mapLayerStyle,
                ]}
              >
                {previewUrl ? (
                  <Image
                    key={`preview-${mapAttempt}`}
                    source={{ uri: previewUrl }}
                    fadeDuration={0}
                    resizeMode="cover"
                    onLoad={markBasemapReady}
                    onError={() => {
                      previewFailedRef.current = true;
                      if (tileCount > 0 && tileFailRef.current >= tileCount) markBasemapFailed();
                    }}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: layout.width,
                      height: layout.height,
                    }}
                  />
                ) : null}
                {tiles.map((tile) => {
                  let source = tileSourcesRef.current.get(tile.url);
                  if (!source) {
                    source = { uri: tile.url };
                    tileSourcesRef.current.set(tile.url, source);
                  }
                  return (
                  <Image
                    key={`${tile.key}-${mapAttempt}`}
                    source={source}
                    fadeDuration={0}
                    resizeMode="stretch"
                    resizeMethod="scale"
                    onLoad={markBasemapReady}
                    onError={noteTileError}
                    style={{
                      position: 'absolute',
                      left: tile.left,
                      top: tile.top,
                      width: tile.size + 1,
                      height: tile.size + 1,
                    }}
                  />
                  );
                })}
                {overlayGeometry ? (
                  <Svg
                    width={overlayGeometry.width}
                    height={overlayGeometry.height}
                    style={{
                      position: 'absolute',
                      left: overlayGeometry.left,
                      top: overlayGeometry.top,
                    }}
                  >
                    {overlayGeometry.cityPath ? (
                      <>
                        <SvgPath
                          d={overlayGeometry.cityPath}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        <SvgPath
                          d={overlayGeometry.cityPath}
                          fill="none"
                          stroke="#1F7A8C"
                          strokeWidth="2.25"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    ) : null}
                    {overlayGeometry.routePoints ? (
                      <SvgPolyline
                        points={overlayGeometry.routePoints}
                        fill="none"
                        stroke="#1F7A8C"
                        strokeWidth="4"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : null}
                  </Svg>
                ) : null}
                {pins.map((pin) => {
                  const savedPinIsCentered = cameraLocked
                    && coordinate
                    && Math.abs(mapCenter.latitude - coordinate.latitude) < 0.000001
                    && Math.abs(mapCenter.longitude - coordinate.longitude) < 0.000001;
                  if (pin.key === 'meeting' && savedPinIsCentered) return null;
                  if (pin.key !== 'meeting') {
                    const dot = 14;
                    return (
                      <View
                        key={pin.key}
                        style={{
                          position: 'absolute',
                          left: pin.x - dot / 2,
                          top: pin.y - dot / 2,
                          width: dot,
                          height: dot,
                          borderRadius: dot / 2,
                          backgroundColor: pin.color,
                          borderWidth: 2,
                          borderColor: '#FFFFFF',
                        }}
                      />
                    );
                  }

                  return (
                    <Animated.View
                      key={pin.key}
                      pointerEvents="none"
                      style={[
                        {
                          position: 'absolute',
                          left: pin.x - 16,
                          top: pin.y - 16,
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: '#059669',
                          borderWidth: 3,
                          borderColor: '#ffffff',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 30,
                          elevation: 8,
                        },
                        pinPopStyle,
                      ]}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffffff' }} />
                    </Animated.View>
                  );
                })}
              </Animated.View>
              {cameraLocked && coordinate
                && Math.abs(mapCenter.latitude - coordinate.latitude) < 0.000001
                && Math.abs(mapCenter.longitude - coordinate.longitude) < 0.000001 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 36,
                    height: 36,
                    marginLeft: -18,
                    marginTop: -18,
                    borderRadius: 18,
                    backgroundColor: '#059669',
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    zIndex: 40,
                    elevation: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#ffffff' }} />
                </View>
              ) : null}
          </View>
        ) : (
          <View className="flex-1 items-center justify-center bg-slate-100 px-4 dark:bg-slate-800">
            <MaterialIcons name="map" size={32} color="#1F7A8C" />
            <Text className="mt-2 text-center text-xs text-slate-500">
              {hasMapboxToken() ? 'Loading Mapbox…' : 'Add EXPO_PUBLIC_MAPBOX_TOKEN to enable the Mapbox meeting place map.'}
            </Text>
          </View>
        )}

        {mapReady && !basemapReady && !locating ? (
          <View
            pointerEvents={basemapFailed ? 'auto' : 'none'}
            className={`absolute left-3 right-3 ${editable && meetingPlaceReady && !canMarkOnMap ? 'top-28' : 'top-14'}`}
          >
            <View
              style={{
                borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.94)',
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              {basemapFailed ? (
                <>
                  <Text style={{ flex: 1, fontSize: 12, color: '#334155' }}>
                    The map could not load. Check your connection.
                  </Text>
                  <TouchableOpacity onPress={retryMap}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#16324F' }}>Try again</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ActivityIndicator size="small" color="#16324F" />
                  <Text style={{ marginLeft: 8, fontSize: 12, color: '#334155' }}>Loading map…</Text>
                </>
              )}
            </View>
          </View>
        ) : null}

        {mapReady && !locating ? (
          <View pointerEvents="box-none" className="absolute left-3 top-3">
            <View className="flex-row overflow-hidden rounded-lg bg-white/95" style={{ elevation: 3 }}>
              <TouchableOpacity
                onPress={() => setMapStyle('streets')}
                className={`px-3 py-2 ${mapStyle === 'streets' ? 'bg-teal' : ''}`}
              >
                <Text className={`text-[11px] font-bold ${mapStyle === 'streets' ? 'text-white' : 'text-slate-700'}`}>
                  Streets
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMapStyle('satellite')}
                className={`px-3 py-2 ${mapStyle === 'satellite' ? 'bg-teal' : ''}`}
              >
                <Text className={`text-[11px] font-bold ${mapStyle === 'satellite' ? 'text-white' : 'text-slate-700'}`}>
                  Satellite
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {locating && (
          <View className="absolute inset-0 items-center justify-center bg-white/70 dark:bg-slate-900/70">
            <ActivityIndicator size="large" color="#1F7A8C" />
            <Text className="mt-3 px-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
              Detecting your location…
            </Text>
            <Text className="mt-1 px-6 text-center text-xs text-slate-500 dark:text-slate-400">
              {showRouteLine
                ? 'Finding your location for the route to the meeting place…'
                : `This will be marked as your ${markerTitle}`}
            </Text>
          </View>
        )}

        {!locating && editable && meetingPlaceReady && !canMarkOnMap && (
          <View pointerEvents="none" className="absolute left-3 right-3 top-14">
            <View className="self-start rounded-lg bg-emerald-600/95 px-3 py-2">
              <Text className="text-center text-xs font-bold text-white">
                {restrictToCityBounds
                  ? `El Salvador City · ${markerTitle} set`
                  : `Location set · ${markerTitle}`}
              </Text>
            </View>
          </View>
        )}

        {restrictToCityBounds && !locating && (
          <View pointerEvents="none" className="absolute bottom-3 left-3 right-3">
            <View className="self-start rounded-lg bg-blue-600/90 px-3 py-2">
              <Text className="text-[10px] font-bold text-white">
                Teal line = El Salvador City border · Pinch to zoom
              </Text>
            </View>
          </View>
        )}
      </View>
      {editable && canUseGpsButton && (
        <View className="mt-2 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => locateUser({ force: true })}
            disabled={locating}
            className="flex-row items-center rounded-lg bg-blue-50 dark:bg-blue-900/30 px-3 py-2"
          >
            {locating ? (
              <ActivityIndicator size="small" color="#1F7A8C" />
            ) : (
              <MaterialIcons name="gps-fixed" size={16} color="#1F7A8C" />
            )}
            <Text className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
              Use My GPS Location
            </Text>
          </TouchableOpacity>
          {coordinate && (
            <Text className="text-[10px] text-slate-500 dark:text-slate-400">
              {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
            </Text>
          )}
        </View>
      )}

      {canMarkOnMap && !locating && (
        <View className="mt-2 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 px-3 py-2">
          <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Tap once to drop the pin. Drag only moves the map and does not move the pin. Pinch to zoom in. Switch Streets or Satellite.
          </Text>
        </View>
      )}

      {meetingPlaceReady && editable && shouldAutoDetect && !locating && (
        <View className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 px-3 py-2">
          <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Your GPS location is marked as {markerTitle}.
          </Text>
        </View>
      )}

      {meetingPlaceReady && editable && canMarkOnMap && !locating && (
        <View className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 px-3 py-2">
          <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {markerLabel || markerTitle} marked on the Mapbox map.
          </Text>
        </View>
      )}

      {outsideCity && (
        <View className="mt-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2">
          <Text className="text-xs font-semibold text-red-700 dark:text-red-300">
            You cannot continue — this location is outside El Salvador City.
          </Text>
          <Text className="mt-1 text-xs text-red-600 dark:text-red-400">
            {shouldAutoDetect
              ? 'Move inside El Salvador City, then tap Use My GPS Location again.'
              : 'Tap only inside the El Salvador City border on the map.'}
          </Text>
        </View>
      )}

      {showRouteLine && coordinate && !locating ? (
        <View className="mt-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
          <View className="flex-row items-center">
            <View className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            <Text className="ml-1.5 text-xs font-semibold text-slate-700">You</Text>
            <View className="ml-4 h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <Text className="ml-1.5 text-xs font-semibold text-slate-700">Meeting place</Text>
          </View>
          <Text className="mt-2 text-[11px] text-slate-500">
            Keep GPS on so the You dot can follow you.
          </Text>
          {atMeetingPlace ? (
            <Text className="mt-1 text-[11px] font-semibold text-emerald-700">
              You're in your meeting place.
            </Text>
          ) : null}
        </View>
      ) : null}

      {gpsError && !outsideCity && (
        <View className="mt-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-3 py-2">
          <Text className="text-xs text-amber-700 dark:text-amber-300">{gpsError}</Text>
          {permissionDenied && (
            <Text className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Please enable location permission, then tap Refresh Location.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function sameCoordinate(left?: { latitude: number; longitude: number } | null, right?: { latitude: number; longitude: number } | null) {
  return left?.latitude === right?.latitude && left?.longitude === right?.longitude;
}

export const MeetingPlaceMap = memo(MeetingPlaceMapComponent, (prev, next) => (
  sameCoordinate(prev.coordinate, next.coordinate)
  && sameCoordinate(prev.focusCoordinate, next.focusCoordinate)
  && prev.focusZoom === next.focusZoom
  && prev.snapZoom === next.snapZoom
  && prev.markerLabel === next.markerLabel
  && prev.markerTitle === next.markerTitle
  && prev.height === next.height
  && prev.editable === next.editable
  && prev.allowMapMarking === next.allowMapMarking
  && prev.restrictToCityBounds === next.restrictToCityBounds
  && prev.showUserLocation === next.showUserLocation
  && prev.showGpsButton === next.showGpsButton
  && prev.showRouteLine === next.showRouteLine
  && prev.autoDetectGps === next.autoDetectGps
));
