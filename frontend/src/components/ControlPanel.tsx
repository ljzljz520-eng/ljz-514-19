import { Button, Divider, Select, Skeleton, Typography } from "antd";
import { ArrowLeftRight, MapPin, Route, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTravelStore, type TravelNode } from "@/stores/useTravelStore";

const { Text } = Typography;

export default function ControlPanel() {
  const nodes = useTravelStore((s) => s.nodes);
  const nodesLoading = useTravelStore((s) => s.nodesLoading);
  const startId = useTravelStore((s) => s.startId);
  const endId = useTravelStore((s) => s.endId);
  const route = useTravelStore((s) => s.route);
  const routeLoading = useTravelStore((s) => s.routeLoading);
  const setStartId = useTravelStore((s) => s.setStartId);
  const setEndId = useTravelStore((s) => s.setEndId);
  const swap = useTravelStore((s) => s.swap);
  const clear = useTravelStore((s) => s.clear);
  const fetchRoute = useTravelStore((s) => s.fetchRoute);
  const hoveredSegmentIndex = useTravelStore((s) => s.hoveredSegmentIndex);
  const setHoveredSegment = useTravelStore((s) => s.setHoveredSegment);
  const setHoveredNodeId = useTravelStore((s) => s.setHoveredNodeId);
  const selectedNodeId = useTravelStore((s) => s.selectedNodeId);
  const focusNodeOnMap = useTravelStore((s) => s.focusNodeOnMap);
  const revealRouteStep = useTravelStore((s) => s.revealRouteStep);
  const scrollTarget = useTravelStore((s) => s.scrollTarget);

  const [keyword, setKeyword] = useState<string>("");
  const [flashNodeId, setFlashNodeId] = useState<string | undefined>(undefined);
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const options = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const list = k ? nodes.filter((n) => (n.name || "").toLowerCase().includes(k)) : nodes;
    return list.map((n) => ({ label: n.name || n.id, value: n.id }));
  }, [keyword, nodes]);

  const distanceText = useMemo(() => {
    if (!route) return "";
    const m = route.totalDistanceMeters;
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(2)} km`;
  }, [route]);

  const routeNodeIndex = useMemo(() => {
    const m = new Map<string, number>();
    route?.pathNodes.forEach((n, idx) => m.set(n.id, idx));
    return m;
  }, [route]);

  // 地图上点击景点后：滚动到对应路线步骤并闪烁提示
  useEffect(() => {
    if (!scrollTarget) return;
    const el = stepRefs.current.get(scrollTarget.nodeId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashNodeId(scrollTarget.nodeId);
    const timer = window.setTimeout(() => setFlashNodeId(undefined), 2400);
    return () => window.clearTimeout(timer);
  }, [scrollTarget]);

  const handleSpotCardClick = (n: TravelNode) => {
    focusNodeOnMap(n.id);
    if (routeNodeIndex.has(n.id)) revealRouteStep(n.id);
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900">重庆旅游线路规划</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">数据源：nodes.csv</span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">权重：地理距离</span>
          </div>
        </div>
        <Button type="text" onClick={() => clear()} icon={<X className="h-4 w-4" />} />
      </div>

      <Divider className="my-3" />

      {nodesLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          <div className="space-y-2">
            <Text type="secondary">起点</Text>
            <Select
              showSearch
              value={startId}
              placeholder="选择起点"
              options={options}
              className="w-full"
              filterOption={false}
              onSearch={setKeyword}
              onChange={(v) => setStartId(v)}
              allowClear
            />
          </div>

          <div className="mt-3 space-y-2">
            <Text type="secondary">终点</Text>
            <Select
              showSearch
              value={endId}
              placeholder="选择终点"
              options={options}
              className="w-full"
              filterOption={false}
              onSearch={setKeyword}
              onChange={(v) => setEndId(v)}
              allowClear
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => swap()} icon={<ArrowLeftRight className="h-4 w-4" />}>
              交换
            </Button>
            <Button type="primary" loading={routeLoading} onClick={() => fetchRoute()} icon={<Route className="h-4 w-4" />}>
              开始规划
            </Button>
          </div>

          <Divider className="my-4" />

          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">路径结果</div>
              {route ? <div className="text-xs text-slate-500">{distanceText}</div> : null}
            </div>
            {route ? <div className="mt-1 text-xs text-slate-400">悬停查看路段高亮，点击步骤在地图定位</div> : null}

            {route ? (
              <div className="mt-3 space-y-2">
                {route.pathNodes.map((n, idx) => {
                  const isSegmentHovered = idx > 0 && hoveredSegmentIndex === idx - 1;
                  const isSelected = selectedNodeId === n.id;
                  const isFlashing = flashNodeId === n.id;
                  return (
                    <div
                      key={n.id}
                      ref={(el) => {
                        if (el) stepRefs.current.set(n.id, el);
                        else stepRefs.current.delete(n.id);
                      }}
                      className={[
                        "cursor-pointer rounded-lg border p-2 transition-colors",
                        isFlashing
                          ? "route-step-flash border-blue-400"
                          : isSegmentHovered
                            ? "border-orange-400 bg-orange-50"
                            : isSelected
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                      onMouseEnter={() => {
                        setHoveredNodeId(n.id);
                        if (idx > 0) setHoveredSegment(idx - 1);
                      }}
                      onMouseLeave={() => {
                        setHoveredNodeId(undefined);
                        setHoveredSegment(null);
                      }}
                      onClick={() => focusNodeOnMap(n.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-900">
                          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs">
                            {idx + 1}
                          </span>
                          {n.name}
                        </div>
                        <div className="text-xs text-slate-500">{n.type || ""}</div>
                      </div>
                      {n.desc ? <div className="mt-1 text-xs text-slate-600">{n.desc}</div> : null}
                      {idx > 0 ? (
                        <div className={["mt-1 text-xs", isSegmentHovered ? "font-medium text-orange-600" : "text-slate-500"].join(" ")}>
                          与上一点约 {Math.round(route.segmentDistanceMeters[idx - 1])} m
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-600">选择起点与终点后开始规划。</div>
            )}

            <Divider className="my-3" />

            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">全部景点</div>
                <div className="text-xs text-slate-400">{nodes.length} 个</div>
              </div>
              <div className="mt-1 text-xs text-slate-400">点击卡片：地图定位，若在路线中则同步滚动到对应步骤</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {nodes.map((n) => {
                  const stepIdx = routeNodeIndex.get(n.id);
                  const inRoute = stepIdx !== undefined;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleSpotCardClick(n)}
                      className={[
                        "rounded-lg border p-2 text-left transition-colors",
                        inRoute
                          ? "border-blue-200 bg-blue-50/60 hover:bg-blue-100"
                          : "border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-1 text-xs font-medium text-slate-900">
                        <MapPin className={inRoute ? "h-3 w-3 text-blue-600" : "h-3 w-3 text-slate-400"} />
                        <span className="truncate">{n.name}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">{n.type || "景点"}</span>
                        {inRoute ? (
                          <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                            第 {stepIdx + 1} 站
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
