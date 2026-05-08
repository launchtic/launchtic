import React, { useState } from "react";
import { CollapsedButtonSideBar, SidebarUi, SidebarFooterUi, IconButton, SidebarContainerUi, SidebarContainer, DeviceSwitcherUi } from "./common/EditorUI";
import { useEditor } from "@craftjs/core";
import { Toolbox } from "./Toolbox";
import { SavedBlocksToolbox } from "./SavedBlocksToolbox";
import { SettingsPanel } from "./SettingsPanel";
import { StepSettingsPanel } from "./StepSettingsPanel";
import { useAppContext } from "@launchtic/elements";
import { LayoutTemplate, Settings, Bookmark } from "lucide-react";

type SidebarTab = "elements" | "saved-blocks" | "page-settings";

const TAB_STYLE_BASE: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: "7px 4px",
  fontSize: 11,
  fontWeight: 500,
  border: "none",
  background: "none",
  cursor: "pointer",
  borderBottom: "2px solid transparent",
  transition: "color 0.15s, border-color 0.15s",
  whiteSpace: "nowrap" as const,
};

const SidebarContent = ({ sidebarTab }: { sidebarTab: SidebarTab }) => {
  const { selected } = useEditor((state) => ({
    selected: state.events.selected,
  }));

  if (sidebarTab === "page-settings") {
    return (
      <SidebarContainerUi>
        <StepSettingsPanel />
      </SidebarContainerUi>
    );
  }

  if (sidebarTab === "saved-blocks") {
    return (
      <SidebarContainerUi>
        <SidebarContainer>
          <SavedBlocksToolbox />
        </SidebarContainer>
      </SidebarContainerUi>
    );
  }

  return (
    <SidebarContainerUi>
      {selected.size === 0 ? <Toolbox /> : <SettingsPanel />}
    </SidebarContainerUi>
  );
};

const Sidebar: React.FC = () => {
  const { viewMode, setViewMode, isSidebarCollapsed, setSidebarCollapsed } = useAppContext();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("elements");

  return (
    <SidebarUi>
      <CollapsedButtonSideBar onClick={() => setSidebarCollapsed(!isSidebarCollapsed)} />

      {/* Tab switcher */}
      <div style={{ display: isSidebarCollapsed ? "none" : "flex", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        {([
          { id: "elements",      label: "Elements",      icon: LayoutTemplate },
          { id: "page-settings", label: "Page Settings", icon: Settings       },
          { id: "saved-blocks",  label: "Saved Blocks",  icon: Bookmark       },
        ] as { id: SidebarTab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSidebarTab(id)}
            style={{
              ...TAB_STYLE_BASE,
              color:            sidebarTab === id ? "#2563eb" : "#6b7280",
              borderBottomColor: sidebarTab === id ? "#2563eb" : "transparent",
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      <SidebarContent sidebarTab={sidebarTab} />

      <SidebarFooterUi>
        <div />
        <DeviceSwitcherUi>
          <IconButton $active={viewMode === "desktop"} onClick={() => setViewMode("desktop")}>
            <i className="fas fa-desktop" />
          </IconButton>
          <IconButton $active={viewMode === "mobile"} onClick={() => setViewMode("mobile")}>
            <i className="fas fa-mobile-alt" />
          </IconButton>
        </DeviceSwitcherUi>
      </SidebarFooterUi>
    </SidebarUi>
  );
};

export default Sidebar;
