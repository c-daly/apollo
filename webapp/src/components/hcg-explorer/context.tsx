/**
 * State management context for HCG Explorer
 */

/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type ReactNode,
  type Dispatch,
} from 'react'
import type {
  HCGExplorerState,
  HCGExplorerAction,
  FilterConfig,
  EmbeddingConfig,
  GraphSnapshot,
  TimestampedSnapshot,
  DataMode,
  NeighborhoodPayload,
} from './types'
import {
  DEFAULT_FILTER_CONFIG,
  DEFAULT_EMBEDDING_CONFIG,
  EMPTY_SNAPSHOT,
} from './types'
import { mergeNeighborhood } from './utils/graph-processor'

const HISTORY_LIMIT = 50

/** Initial state */
const initialState: HCGExplorerState = {
  viewMode: '3d',
  layout: 'force-3d',
  // Lazy seed+expand is the default; the canvas starts empty.
  dataMode: 'lazy',
  workingSet: EMPTY_SNAPSHOT,
  expandedNodeIds: [],
  currentSnapshot: null,
  snapshotHistory: [],
  timelineIndex: -1,
  filterConfig: DEFAULT_FILTER_CONFIG,
  embeddingConfig: DEFAULT_EMBEDDING_CONFIG,
  selectedNodeId: null,
  hoveredNodeId: null,
  isPlaying: false,
  playbackSpeed: 1,
  showFilterPanel: false,
  showNodeDetails: true,
  showClusterLegend: true,
}

/** State reducer */
function explorerReducer(
  state: HCGExplorerState,
  action: HCGExplorerAction
): HCGExplorerState {
  switch (action.type) {
    case 'SET_VIEW_MODE': {
      // Auto-switch layout when changing view mode
      const layout = action.mode === '3d' ? 'force-3d' : 'dagre'
      return { ...state, viewMode: action.mode, layout }
    }

    case 'SET_LAYOUT':
      return { ...state, layout: action.layout }

    case 'SET_FILTER':
      return {
        ...state,
        filterConfig: { ...state.filterConfig, ...action.config },
      }

    case 'RESET_FILTERS':
      return { ...state, filterConfig: DEFAULT_FILTER_CONFIG }

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.id }

    case 'HOVER_NODE':
      return { ...state, hoveredNodeId: action.id }

    case 'SET_TIMELINE_INDEX': {
      const index = Math.max(
        -1,
        Math.min(action.index, state.snapshotHistory.length - 1)
      )
      const currentSnapshot =
        index >= 0 ? state.snapshotHistory[index].data : null
      return { ...state, timelineIndex: index, currentSnapshot }
    }

    case 'TOGGLE_PLAYBACK':
      return { ...state, isPlaying: !state.isPlaying }

    case 'SET_PLAYBACK_SPEED':
      return { ...state, playbackSpeed: action.speed }

    case 'ADD_SNAPSHOT': {
      const timestamp = action.snapshot.timestamp || new Date().toISOString()
      const newEntry: TimestampedSnapshot = {
        timestamp,
        data: action.snapshot,
        index: state.snapshotHistory.length,
      }
      const history = [...state.snapshotHistory, newEntry].slice(-HISTORY_LIMIT)
      // Update indices after slicing
      const reindexed = history.map((entry, idx) => ({ ...entry, index: idx }))
      return {
        ...state,
        snapshotHistory: reindexed,
        currentSnapshot: action.snapshot,
        timelineIndex: reindexed.length - 1,
      }
    }

    case 'SET_EMBEDDING_CONFIG':
      return {
        ...state,
        embeddingConfig: { ...state.embeddingConfig, ...action.config },
      }

    case 'TOGGLE_FILTER_PANEL':
      return { ...state, showFilterPanel: !state.showFilterPanel }

    case 'TOGGLE_NODE_DETAILS':
      return { ...state, showNodeDetails: !state.showNodeDetails }

    case 'TOGGLE_CLUSTER_LEGEND':
      return { ...state, showClusterLegend: !state.showClusterLegend }

    case 'SET_DATA_MODE':
      return { ...state, dataMode: action.mode }

    case 'MERGE_NEIGHBORHOOD': {
      // Merge the fetched neighborhood into the accumulated working set
      // (pure dedupe by node id / edge id). Mark the expanded root so the
      // renderers can flag explored nodes. Switching to lazy mode here keeps
      // the canvas pointed at the working set after a seed/expand.
      const workingSet = mergeNeighborhood(state.workingSet, action.neighborhood)
      const expandedNodeIds =
        action.rootId && !state.expandedNodeIds.includes(action.rootId)
          ? [...state.expandedNodeIds, action.rootId]
          : state.expandedNodeIds
      return { ...state, dataMode: 'lazy', workingSet, expandedNodeIds }
    }

    case 'RESET_WORKING_SET':
      return {
        ...state,
        workingSet: EMPTY_SNAPSHOT,
        expandedNodeIds: [],
        selectedNodeId: null,
        hoveredNodeId: null,
      }

    default:
      return state
  }
}

/** Context type */
interface HCGExplorerContextValue {
  state: HCGExplorerState
  dispatch: Dispatch<HCGExplorerAction>
  // Convenience actions
  setViewMode: (mode: '2d' | '3d') => void
  setLayout: (layout: HCGExplorerState['layout']) => void
  setFilter: (config: Partial<FilterConfig>) => void
  resetFilters: () => void
  selectNode: (id: string | null) => void
  hoverNode: (id: string | null) => void
  setTimelineIndex: (index: number) => void
  togglePlayback: () => void
  setPlaybackSpeed: (speed: number) => void
  addSnapshot: (snapshot: GraphSnapshot) => void
  setEmbeddingConfig: (config: Partial<EmbeddingConfig>) => void
  // Lazy-load (seed + expand)
  setDataMode: (mode: DataMode) => void
  mergeNeighborhood: (
    neighborhood: NeighborhoodPayload,
    rootId?: string | null
  ) => void
  resetWorkingSet: () => void
}

const HCGExplorerContext = createContext<HCGExplorerContextValue | null>(null)

/** Provider component */
export function HCGExplorerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(explorerReducer, initialState)

  // Stable action references — dispatch identity never changes, so these
  // don't need to be recreated when state updates.
  const actions = useMemo(
    () => ({
      setViewMode: (mode: '2d' | '3d') => dispatch({ type: 'SET_VIEW_MODE', mode }),
      setLayout: (layout: HCGExplorerState['layout']) =>
        dispatch({ type: 'SET_LAYOUT', layout }),
      setFilter: (config: Partial<FilterConfig>) =>
        dispatch({ type: 'SET_FILTER', config }),
      resetFilters: () => dispatch({ type: 'RESET_FILTERS' }),
      selectNode: (id: string | null) => dispatch({ type: 'SELECT_NODE', id }),
      hoverNode: (id: string | null) => dispatch({ type: 'HOVER_NODE', id }),
      setTimelineIndex: (index: number) =>
        dispatch({ type: 'SET_TIMELINE_INDEX', index }),
      togglePlayback: () => dispatch({ type: 'TOGGLE_PLAYBACK' }),
      setPlaybackSpeed: (speed: number) =>
        dispatch({ type: 'SET_PLAYBACK_SPEED', speed }),
      addSnapshot: (snapshot: GraphSnapshot) =>
        dispatch({ type: 'ADD_SNAPSHOT', snapshot }),
      setEmbeddingConfig: (config: Partial<EmbeddingConfig>) =>
        dispatch({ type: 'SET_EMBEDDING_CONFIG', config }),
      setDataMode: (mode: DataMode) => dispatch({ type: 'SET_DATA_MODE', mode }),
      mergeNeighborhood: (
        neighborhood: NeighborhoodPayload,
        rootId?: string | null
      ) => dispatch({ type: 'MERGE_NEIGHBORHOOD', neighborhood, rootId }),
      resetWorkingSet: () => dispatch({ type: 'RESET_WORKING_SET' }),
    }),
    [dispatch]
  )

  const value = useMemo<HCGExplorerContextValue>(
    () => ({
      state,
      dispatch,
      ...actions,
    }),
    [state, dispatch, actions]
  )

  return (
    <HCGExplorerContext.Provider value={value}>
      {children}
    </HCGExplorerContext.Provider>
  )
}

/** Hook to access explorer context */
export function useHCGExplorer(): HCGExplorerContextValue {
  const context = useContext(HCGExplorerContext)
  if (!context) {
    throw new Error('useHCGExplorer must be used within HCGExplorerProvider')
  }
  return context
}
