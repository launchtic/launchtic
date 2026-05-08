import React from "react";
import { useAppContext } from "../../../contexts/AppContext";

export const ViewModeIcon: React.FC = () => {
  const { viewMode } = useAppContext();

  if (viewMode === "desktop") return null;
  return <i className="fas fa-mobile-alt" style={{ marginLeft: 8 }}></i>;
};
