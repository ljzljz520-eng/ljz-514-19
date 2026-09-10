import { create } from "zustand";
import { notification } from "antd";

export type TravelNode = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  desc?: string;
};

export type PathResult = {
  startId: string;
  endId: string;
  totalDistanceMeters: number;
  pathNodeIds: string[];
  pathNodes: TravelNode[];
  segmentDistanceMeters: number[];
};

type State = {
  nodes: TravelNode[];
  nodesLoading: boolean;
  startId?: string;
  endId?: string;
  route?: PathResult;
  routeLoading: boolean;
  selectedNodeId?: string;
  /** 当前悬停的路段下标（路段 i 连接 pathNodes[i] 与 pathNodes[i+1]），列表与地图双向共享 */
  hoveredSegmentIndex: number | null;
  /** 当前悬停的景点（列表悬停时高亮地图 marker） */
  hoveredNodeId?: string;
  /** 地图聚焦信号：nonce 变化时地图飞向该景点并打开弹窗 */
  focusTarget: { nodeId: string; nonce: number } | null;
  /** 列表定位信号：nonce 变化时路线列表滚动到对应步骤并闪烁 */
  scrollTarget: { nodeId: string; nonce: number } | null;
};

type Actions = {
  loadNodes: () => Promise<void>;
  setStartId: (id?: string) => void;
  setEndId: (id?: string) => void;
  swap: () => void;
  clear: () => void;
  setSelectedNodeId: (id?: string) => void;
  setHoveredSegment: (index: number | null) => void;
  setHoveredNodeId: (id?: string) => void;
  /** 点击景点卡片/步骤：地图飞向该点并打开弹窗 */
  focusNodeOnMap: (id: string) => void;
  /** 点击地图上的景点：路线列表滚动到对应步骤 */
  revealRouteStep: (id: string) => void;
  fetchRoute: () => Promise<void>;
};

const apiBase = import.meta.env.VITE_API_BASE || "/api";

export const useTravelStore = create<State & Actions>((set, get) => ({
  nodes: [],
  nodesLoading: false,
  routeLoading: false,
  hoveredSegmentIndex: null,
  focusTarget: null,
  scrollTarget: null,

  loadNodes: async () => {
    if (get().nodesLoading) return;
    set({ nodesLoading: true });
    try {
      const res = await fetch(`${apiBase}/nodes`);
      if (!res.ok) throw new Error("nodes_fetch_failed");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("nodes_payload_invalid");
      const nodes = (data as Array<Record<string, unknown>>)
        .map((raw) => {
          const id = String(raw?.id ?? "").trim();
          const name = String(raw?.name ?? "").trim();
          const lat = Number(raw?.lat);
          const lng = Number(raw?.lng);
          const type = typeof raw?.type === "string" ? raw.type : undefined;
          const desc = typeof raw?.desc === "string" ? raw.desc : undefined;
          return { id, name, lat, lng, type, desc } satisfies TravelNode;
        })
        .filter((n) => n.id && Number.isFinite(n.lat) && Number.isFinite(n.lng));
      set({ nodes });
    } catch {
      notification.error({ message: "加载节点失败", description: "请检查后端服务是否已启动" });
    } finally {
      set({ nodesLoading: false });
    }
  },

  setStartId: (id) => set({ startId: id, route: undefined, hoveredSegmentIndex: null, hoveredNodeId: undefined, scrollTarget: null }),
  setEndId: (id) => set({ endId: id, route: undefined, hoveredSegmentIndex: null, hoveredNodeId: undefined, scrollTarget: null }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setHoveredSegment: (index) => set({ hoveredSegmentIndex: index }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

  focusNodeOnMap: (id) =>
    set((s) => ({
      selectedNodeId: id,
      focusTarget: { nodeId: id, nonce: (s.focusTarget?.nonce ?? 0) + 1 },
    })),

  revealRouteStep: (id) =>
    set((s) => ({
      selectedNodeId: id,
      scrollTarget: { nodeId: id, nonce: (s.scrollTarget?.nonce ?? 0) + 1 },
    })),

  swap: () => {
    const { startId, endId } = get();
    set({ startId: endId, endId: startId, route: undefined, hoveredSegmentIndex: null, hoveredNodeId: undefined, scrollTarget: null });
  },

  clear: () =>
    set({
      startId: undefined,
      endId: undefined,
      route: undefined,
      selectedNodeId: undefined,
      hoveredSegmentIndex: null,
      hoveredNodeId: undefined,
      focusTarget: null,
      scrollTarget: null,
    }),

  fetchRoute: async () => {
    const { startId, endId } = get();
    if (!startId || !endId) {
      notification.warning({ message: "请选择起点与终点" });
      return;
    }
    set({ routeLoading: true });
    try {
      const qs = new URLSearchParams({ from: startId, to: endId });
      const res = await fetch(`${apiBase}/path?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        notification.error({ message: "规划失败", description: data?.error || "后端错误" });
        return;
      }
      set({ route: data as PathResult, hoveredSegmentIndex: null, hoveredNodeId: undefined, scrollTarget: null });
    } catch {
      notification.error({ message: "规划失败", description: "网络异常或后端不可用" });
    } finally {
      set({ routeLoading: false });
    }
  },
}));
