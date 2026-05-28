"use client";
import React, { createContext, useState, ReactNode, useContext } from "react";

// Define the interface for DropIndicator
interface DropIndicator {
  draggedNodeType?: string;
  targetId: string;
  position: "before" | "after" | null;
  targetType: string;
  dropIndex: number;
}

// Group together the drag-drop related properties
interface DragDropState {
  isDragging: boolean;
  dropTargets: string[];
  dropIndicator: DropIndicator | null;
}

// Context type
interface AppContextType {
  viewMode: "mobile" | "desktop";
  setViewMode: React.Dispatch<React.SetStateAction<"mobile" | "desktop">>;
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  // Group all drag/drop properties together into a single object
  dragDrop: DragDropState;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setDropTargets: React.Dispatch<React.SetStateAction<string[]>>;
  setDropIndicator: React.Dispatch<React.SetStateAction<DropIndicator | null>>;
}

// Create Context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Context Provider
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [viewMode, setViewMode] = useState<"mobile" | "desktop">("desktop");
  const [isSidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dropTargets, setDropTargets] = useState<string[]>([]);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  const dragDrop: DragDropState = {
    isDragging,
    dropTargets,
    dropIndicator
  };

  return (
    <AppContext.Provider value={{
      viewMode,
      setViewMode,
      isSidebarCollapsed,
      setSidebarCollapsed,
      dragDrop,
      setIsDragging,
      setDropTargets,
      setDropIndicator
    }}>
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use AppContext
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
