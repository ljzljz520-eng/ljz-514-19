import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer as LeafletMap, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import { Button } from "antd";
import { useTravelStore } from "@/stores/useTravelStore";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker,
  shadowUrl: shadow,
});

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds.pad(0.15));
  }, [map, points]);
  return null;
}

function makeDotIcon(color: string, extraClass = "") {
  return L.divIcon({
    className: "",
    html: `<div class="map-dot ${extraClass}" style="width:18px;height:18px;border-radius:999px;background:${color};border:2px solid white;box-shadow:0 6px 18px rgba(0,0,0,.18)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** 监听 focusTarget：点击景点卡片/步骤后地图飞向该点并打开弹窗 */
function FocusNodeEffect({ markerRefs }: { markerRefs: { current: Map<string, L.Marker> } }) {
  const map = useMap();
  const focusTarget = useTravelStore((s) => s.focusTarget);
  const nodes = useTravelStore((s) => s.nodes);

  useEffect(() => {
    if (!focusTarget) return;
    const node = nodes.find((n) => n.id === focusTarget.nodeId);
    if (!node) return;
    map.flyTo([node.lat, node.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
    const timer = window.setTimeout(() => {
      markerRefs.current.get(node.id)?.openPopup();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [focusTarget, map, nodes, markerRefs]);

  return null;
}

/**
 * 底图图层：
 * - 优先使用在线 OSM 瓦片；
 * - 连续瓦片加载失败（离线 / 外网受限）时自动切换到 public/tiles 内置离线瓦片；
 * - 浏览器重新联网后自动切回在线图层。
 * 离线瓦片覆盖范围见 public/tiles/README.md（重庆市区 z8–z14），覆盖范围外用透明瓦片兜底，
 * 不影响节点、路线等矢量要素的展示。
 */
const ONLINE_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OFFLINE_TILE_URL = `${import.meta.env.BASE_URL}tiles/{z}/{x}/{y}.png`;
const TRANSPARENT_TILE_URL = `${import.meta.env.BASE_URL}tiles/transparent.png`;
const ONLINE_FAIL_THRESHOLD = 4;
const OFFLINE_BASEMAP_EVENT = "cqtravel:offline-basemap";

function isOfflineCapableBrowser() {
  return typeof navigator !== "undefined" && (!navigator.onLine || window.location.protocol === "file:");
}

function BaseLayer() {
  const [useOffline, setUseOffline] = useState(isOfflineCapableBrowser);
  const failCountRef = useRef(0);

  useEffect(() => {
    const goOnline = () => {
      failCountRef.current = 0;
      setUseOffline(false);
    };
    const goOffline = () => setUseOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (useOffline) {
    return (
      <TileLayer
        key="offline"
        attribution="离线底图瓦片 © OpenStreetMap contributors"
        url={OFFLINE_TILE_URL}
        maxNativeZoom={14}
        minZoom={8}
        maxZoom={18}
        errorTileUrl={TRANSPARENT_TILE_URL}
      />
    );
  }

  return (
    <TileLayer
      key="online"
      attribution="&copy; OpenStreetMap contributors"
      url={ONLINE_TILE_URL}
      maxZoom={18}
      eventHandlers={{
        tileerror: () => {
          failCountRef.current += 1;
          if (failCountRef.current >= ONLINE_FAIL_THRESHOLD) {
            setUseOffline(true);
            window.dispatchEvent(new Event(OFFLINE_BASEMAP_EVENT));
          }
        },
        tileload: () => {
          failCountRef.current = 0;
        },
      }}
    />
  );
}

function BaseLayerStatus() {
  const [offline, setOffline] = useState(isOfflineCapableBrowser);

  useEffect(() => {
    const update = () => setOffline(isOfflineCapableBrowser());
    const useOfflineFallback = () => setOffline(true);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(OFFLINE_BASEMAP_EVENT, useOfflineFallback);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(OFFLINE_BASEMAP_EVENT, useOfflineFallback);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-white shadow-lg">
      离线底图
    </div>
  );
}

export default function MapContainer() {
  const nodes = useTravelStore((s) => s.nodes);
  const startId = useTravelStore((s) => s.startId);
  const endId = useTravelStore((s) => s.endId);
  const setStartId = useTravelStore((s) => s.setStartId);
  const setEndId = useTravelStore((s) => s.setEndId);
  const route = useTravelStore((s) => s.route);
  const hoveredSegmentIndex = useTravelStore((s) => s.hoveredSegmentIndex);
  const setHoveredSegment = useTravelStore((s) => s.setHoveredSegment);
  const hoveredNodeId = useTravelStore((s) => s.hoveredNodeId);
  const selectedNodeId = useTravelStore((s) => s.selectedNodeId);
  const revealRouteStep = useTravelStore((s) => s.revealRouteStep);

  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const center: [number, number] = [29.56301, 106.57577];

  const routePoints = useMemo(() => {
    if (!route) return [] as Array<[number, number]>;
    return route.pathNodes.map((n) => [n.lat, n.lng] as [number, number]);
  }, [route]);

  /** 把路线拆成逐段，便于单独高亮某一条边 */
  const segments = useMemo(() => {
    if (!route || route.pathNodes.length < 2) return [] as Array<{ key: string; positions: Array<[number, number]> }>;
    return route.pathNodes.slice(0, -1).map((n, i) => {
      const next = route.pathNodes[i + 1];
      return {
        key: `${n.id}->${next.id}`,
        positions: [
          [n.lat, n.lng],
          [next.lat, next.lng],
        ] as Array<[number, number]>,
      };
    });
  }, [route]);

  const routeNodeIndex = useMemo(() => {
    const m = new Map<string, number>();
    route?.pathNodes.forEach((n, idx) => m.set(n.id, idx));
    return m;
  }, [route]);

  return (
    <LeafletMap center={center} zoom={12} minZoom={8} maxZoom={18} className="h-full w-full">
      <BaseLayer />
      <BaseLayerStatus />

      {nodes.map((n) => {
        const isStart = n.id === startId;
        const isEnd = n.id === endId;
        const isSelected = n.id === selectedNodeId;
        const isHovered = n.id === hoveredNodeId;
        let icon: L.Icon | L.DivIcon | undefined;
        if (isStart) {
          icon = makeDotIcon("#16a34a");
        } else if (isEnd) {
          icon = makeDotIcon("#dc2626");
        } else if (isSelected) {
          icon = makeDotIcon("#2563eb", "map-dot-pulse");
        } else if (isHovered) {
          icon = makeDotIcon("#f97316");
        }
        return (
          <Marker
            key={n.id}
            position={[n.lat, n.lng]}
            {...(icon ? { icon } : {})}
            ref={(m) => {
              if (m) markerRefs.current.set(n.id, m);
              else markerRefs.current.delete(n.id);
            }}
            eventHandlers={{
              click: () => {
                // 点击地图上的景点：若已在路线中，列表滚动到对应步骤
                if (routeNodeIndex.has(n.id)) revealRouteStep(n.id);
              },
            }}
          >
            <Popup>
              <div className="min-w-[220px]">
                <div className="text-sm font-semibold text-slate-900">{n.name}</div>
                {n.desc ? <div className="mt-1 text-xs text-slate-600">{n.desc}</div> : null}
                {routeNodeIndex.has(n.id) ? (
                  <div className="mt-1 text-xs text-blue-600">当前路线第 {(routeNodeIndex.get(n.id) ?? 0) + 1} 站</div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="small" onClick={() => setStartId(n.id)}>
                    设为起点
                  </Button>
                  <Button size="small" type="primary" onClick={() => setEndId(n.id)}>
                    设为终点
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* 透明的加宽热区，方便鼠标悬停到某一段 */}
      {segments.map((seg, i) => (
        <Polyline
          key={`hit-${seg.key}`}
          positions={seg.positions}
          pathOptions={{ color: "#2563eb", weight: 18, opacity: 0 }}
          eventHandlers={{
            mouseover: () => setHoveredSegment(i),
            mouseout: () => setHoveredSegment(null),
          }}
        />
      ))}

      {/* 可见的逐段路线：先画未高亮段，最后画高亮段保证其在最上层；均不可交互，让事件穿透到热区 */}
      {segments.map((seg, i) =>
        i === hoveredSegmentIndex ? null : (
          <Polyline key={seg.key} positions={seg.positions} interactive={false} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.9 }} />
        ),
      )}
      {hoveredSegmentIndex != null && segments[hoveredSegmentIndex] ? (
        <Polyline
          key={`hover-${segments[hoveredSegmentIndex].key}`}
          positions={segments[hoveredSegmentIndex].positions}
          interactive={false}
          pathOptions={{ color: "#f97316", weight: 9, opacity: 1 }}
        />
      ) : null}

      {routePoints.length >= 2 ? <FitBounds points={routePoints} /> : null}
      <FocusNodeEffect markerRefs={markerRefs} />
    </LeafletMap>
  );
}
