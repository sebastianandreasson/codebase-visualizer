import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import {
  DEFAULT_SELECTION_STATE,
  DEFAULT_VIEWPORT_STATE,
  type SelectionState,
} from '../schema/layout'
import { isFileNode, type ProjectSnapshot } from '../schema/snapshot'
import {
  DEFAULT_GRAPH_LAYER_VISIBILITY,
  type VisualizerStore,
  type VisualizerStoreState,
} from '../schema/store'

const INITIAL_VISUALIZER_STATE: VisualizerStoreState = {
  status: 'idle',
  errorMessage: null,
  snapshot: null,
  layouts: [],
  activeLayoutId: null,
  viewport: DEFAULT_VIEWPORT_STATE,
  selection: DEFAULT_SELECTION_STATE,
  graphLayers: DEFAULT_GRAPH_LAYER_VISIBILITY,
}

export function createVisualizerStore(
  initialState: Partial<VisualizerStoreState> = {},
) {
  return createStore<VisualizerStore>()((set, get) => ({
    ...INITIAL_VISUALIZER_STATE,
    ...initialState,
    viewport: {
      ...INITIAL_VISUALIZER_STATE.viewport,
      ...initialState.viewport,
    },
    selection: {
      ...INITIAL_VISUALIZER_STATE.selection,
      ...initialState.selection,
    },
    graphLayers: {
      ...INITIAL_VISUALIZER_STATE.graphLayers,
      ...initialState.graphLayers,
    },
    setStatus: (status) => {
      set({ status })
    },
    setErrorMessage: (errorMessage) => {
      set({ errorMessage })
    },
    setSnapshot: (snapshot) => {
      const currentSelection = get().selection
      const nextNodeId = getNextSelectedNodeId(snapshot, currentSelection)

      set({
        snapshot,
        selection: {
          ...currentSelection,
          nodeId: nextNodeId,
        },
      })
    },
    setLayouts: (layouts) => {
      const activeLayoutId =
        layouts.some((layout) => layout.id === get().activeLayoutId)
          ? get().activeLayoutId
          : layouts[0]?.id ?? null

      set({
        layouts,
        activeLayoutId,
      })
    },
    setActiveLayoutId: (activeLayoutId) => {
      set({ activeLayoutId })
    },
    setViewport: (viewport) => {
      set((state) => ({
        viewport: {
          ...state.viewport,
          ...viewport,
        },
      }))
    },
    setSelection: (selection) => {
      set((state) => ({
        selection: {
          ...state.selection,
          ...selection,
        },
      }))
    },
    selectNode: (nodeId) => {
      set((state) => ({
        selection: {
          ...state.selection,
          nodeId,
          edgeId: null,
          inspectorTab: 'file',
        },
      }))
    },
    selectEdge: (edgeId) => {
      set((state) => ({
        selection: {
          ...state.selection,
          edgeId,
          nodeId: state.selection.nodeId,
          inspectorTab: 'graph',
        },
      }))
    },
    setInspectorTab: (inspectorTab) => {
      set((state) => ({
        selection: {
          ...state.selection,
          inspectorTab,
        },
      }))
    },
    toggleGraphLayer: (layer) => {
      set((state) => ({
        graphLayers: {
          ...state.graphLayers,
          [layer]: !state.graphLayers[layer],
        },
      }))
    },
    setGraphLayerVisibility: (layers) => {
      set((state) => ({
        graphLayers: {
          ...state.graphLayers,
          ...layers,
        },
      }))
    },
    reset: () => {
      set(INITIAL_VISUALIZER_STATE)
    },
  }))
}

export const visualizerStore = createVisualizerStore()

export function useVisualizerStore<T>(
  selector: (state: VisualizerStore) => T,
) {
  return useStore(visualizerStore, selector)
}

function getNextSelectedNodeId(
  snapshot: ProjectSnapshot | null,
  selection: SelectionState,
) {
  if (!snapshot) {
    return null
  }

  if (selection.nodeId && snapshot.nodes[selection.nodeId]) {
    return selection.nodeId
  }

  return getFirstFileNodeId(snapshot)
}

function getFirstFileNodeId(snapshot: ProjectSnapshot) {
  for (const rootId of snapshot.rootIds) {
    const fileNodeId = findFirstFileNodeId(rootId, snapshot)

    if (fileNodeId) {
      return fileNodeId
    }
  }

  return null
}

function findFirstFileNodeId(
  nodeId: string,
  snapshot: ProjectSnapshot,
): string | null {
  const node = snapshot.nodes[nodeId]

  if (!node) {
    return null
  }

  if (isFileNode(node)) {
    return node.id
  }

  if (node.kind !== 'directory') {
    return null
  }

  for (const childId of node.childIds) {
    const fileNodeId = findFirstFileNodeId(childId, snapshot)

    if (fileNodeId) {
      return fileNodeId
    }
  }

  return null
}
