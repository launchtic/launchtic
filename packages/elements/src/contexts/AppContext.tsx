"use client";
import React, { createContext, useState, ReactNode, useContext, useMemo } from "react";

// Define the interface for DropIndicator
interface DropIndicator {
  draggedNodeType?: string;
  targetId: string;
  position: "before" | "after" | null;
  targetType: string;
  dropIndex: number;
}

// Drag-drop state. Lives in its OWN context (see below) because `dropIndicator`
// updates on every mousemove during a drag.
interface DragDropState {
  isDragging: boolean;
  dropTargets: string[];
  dropIndicator: DropIndicator | null;
}

// Stable app/editor chrome state + the (referentially stable) drag setters.
interface AppContextType {
  viewMode: "mobile" | "desktop";
  setViewMode: React.Dispatch<React.SetStateAction<"mobile" | "desktop">>;
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setDropTargets: React.Dispatch<React.SetStateAction<string[]>>;
  setDropIndicator: React.Dispatch<React.SetStateAction<DropIndicator | null>>;
}

// Two separate contexts on purpose:
//  - AppContext holds slowly-changing chrome (viewMode/sidebar) + the stable
//    setters. Every element reads viewMode from here, so it MUST stay stable
//    during a drag — otherwise the whole canvas re-renders per mousemove.
//  - DragDropContext holds the per-mousemove drag state. Only the drag wrappers
//    (ElementDrag/ColumnDrag/RowDrag) subscribe to it, so a dropIndicator update
//    re-renders those light wrappers, not every element's content.
const AppContext = createContext<AppContextType | undefined>(undefined);
const DragDropContext = createContext<DragDropState | undefined>(undefined);

// Context Provider
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [viewMode, setViewMode] = useState<"mobile" | "desktop">("desktop");
  const [isSidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dropTargets, setDropTargets] = useState<string[]>([]);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  // Only changes on viewMode/sidebar (rare). setState setters keep a stable
  // identity, so this value does NOT change while dragging.
  const appValue = useMemo<AppContextType>(
    () => ({
      viewMode,
      setViewMode,
      isSidebarCollapsed,
      setSidebarCollapsed,
      setIsDragging,
      setDropTargets,
      setDropIndicator,
    }),
    [viewMode, isSidebarCollapsed],
  );

  const dragDropValue = useMemo<DragDropState>(
    () => ({ isDragging, dropTargets, dropIndicator }),
    [isDragging, dropTargets, dropIndicator],
  );

  return (
    <AppContext.Provider value={appValue}>
      <DragDropContext.Provider value={dragDropValue}>
        {children}
      </DragDropContext.Provider>
    </AppContext.Provider>
  );
};

// Stable chrome + drag setters.
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};

// Per-mousemove drag state. Subscribe to this ONLY where the live drag values
// are actually rendered (the drag wrappers).
export const useDragDrop = () => {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error("useDragDrop must be used within an AppProvider");
  }
  return context;
};
