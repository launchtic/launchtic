// src/components/editor/common/EditorUI.tsx
import styled from "styled-components";

export const LayoutUi = styled.div.attrs({
  className: "LayoutUi",
})<{ $isSidebarCollapsed: boolean }>`
  display: grid;
  grid-template-columns: ${props => props.$isSidebarCollapsed ? '0 1fr' : '365px 1fr'};
  height: 100vh;
  transition: grid-template-columns 0.3s ease;
`;

export const MobilePhoneUi = styled.div<{ $viewMode?: "mobile" | "desktop" }>`
    display: ${({ $viewMode }) => ($viewMode === "mobile" ? "block" : "contents")};
    width: 375px;
    height: 660px;
    position: absolute;
    left: 50%;
    top: 30px;
    transform: translate(-50%);
    border-width: 30px 10px 50px;
    border-style: solid;
    border-color: #0c2d48;
    border-image: initial;
    border-radius: 20px;
`;



export const SidebarUi = styled.aside.attrs({
  className: "SidebarUi",
})`
  height: calc(-44px + 100vh);
  transition: flex-basis 0.2s linear;
  background-color: rgb(255, 255, 255);
  box-shadow: rgba(0, 0, 0, 0.3) 1px 0px 3px 0px;
  color: rgb(65, 67, 85);
  z-index: 35;
  position: relative;
  display: flex;
  flex-direction: column;
`;

export const SidebarContainerUi = styled.div.attrs({
  className: "SidebarContainerUi",
})`
  overflow-y: auto;
  height: calc(100% - 50px);
`;



export const ToolboxGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
`;

export const ToolboxSection = styled.div`
  margin-bottom: 20px;
`;

export const ToolboxSectionTitle = styled.h4`
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 15px;
  color: #333;
`;

export const ToolboxItemContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

export const IconWrapper = styled.div`
  margin-bottom: 8px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  i {
    font-size: 30px;
    color: #000000;
  }
  img {
    max-width: 30px;
  }
`;

export const CustomIconWrapper = styled.div`
  margin-bottom: 8px;
  height: 40px;
  width: 45px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

// Define the interface for ColumnBar props using transient props
interface ColumnBarProps {
  $width?: string;
  $height?: string;
}

// Use transient props (prefix $) to avoid DOM warnings
export const ColumnBar = styled.div<ColumnBarProps>`
  background-color: #000000;
  border-radius: 2px;
  width: ${props => props.$width || "10px"};
  height: ${props => props.$height || "30px"};
`;

export const ItemLabel = styled.div`
  font-size: 12px;
  color: #555;
`;

export const CollapsedButtonSideBar = styled.div.attrs({
  className: "CollapsedButtonSideBar",
})`
    border-bottom: 10px solid rgb(126, 126, 126);
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    height: 0px;
    width: 20px;
    position: absolute;
    top: 50%;
    left: calc(100% - 15px);
    box-sizing: content-box;
    transform: rotate(90deg);
    cursor: pointer;
`;

export const SidebarFooterUi = styled.div.attrs({
  className: "SidebarFooterUi",
})`
  background-color: rgb(255, 255, 255);
  border-top: 1px solid rgb(235, 237, 240);
  height: 50px;
  display: flex;
  justify-content: space-between;
  width: 100%;
  overflow: hidden;
`;
export const DeviceSwitcherUi = styled.div.attrs({
  className: "DeviceSwitcherUi",
})`
    -webkit-box-align: center;
    align-items: center;
    -webkit-box-pack: end;
    justify-content: flex-end;
    display: flex;
    margin-right: 10px;
`;


export const ContentUi = styled.main.attrs({
  className: "ContentUi",
})`
  position: relative;
`;

export const DeviceWorkAreaUi = styled.div.attrs({
  className: "DeviceWorkAreaUi",
})<{ $viewMode?: "mobile" | "desktop" }>`
  ${({ $viewMode }) =>
    $viewMode === "mobile"
      ? `
    display: block;
    width: 355px;
    height: 580px;
    scroll-behavior: smooth;
  `
      : `
    height: calc(-44px + 100vh);
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `}
`;



export const PageUi = styled.div.attrs({
  className: "PageUi",
})`
  overflow-y: scroll;
  height: 100%;
  scroll-behavior: smooth;
`;

export const PageWrapper = styled.div.attrs({
  className: "PageWrapper",
})`
  display: grid;
  min-height: 100%;
  overflow: hidden;
`;

export const BodyUI = styled.div.attrs({
  className: "BodyUI",
})<{ $viewMode?: "mobile" | "desktop" }>`
  position: relative;
  width: 100%;
  ${({ $viewMode }) => ($viewMode === "mobile" ? "max-width: 350px;" : "")}
`;


export const HeaderContainer = styled.header.attrs({
  className: "HeaderContainer",
})`
  display: grid;
  grid-template-columns: 50px minmax(314px, max-content) auto minmax(230px, max-content);
  -webkit-box-align: center;
  align-items: center;
  grid-column: 1 / 3;
  position: relative;
  z-index: 8;
  background: #000;
  color: rgb(238, 238, 238);
  font-size: 14px;
  box-shadow: rgba(46, 81, 98, 0.18) 0px 2px 2px 0px;
`;

export const HeaderBrandWrapper = styled.div.attrs({
  className: "HeaderBrandWrapper",
})`
  justify-self: center;
  img {
    height: 30px;
  }
  i {
    font-size: 30px;
  }
`;

export const HeaderSettingsWrapper = styled.div.attrs({
  className: "HeaderSettingsWrapper",
})`
  justify-self: start;
`;

export const BreadcrumbsWrapper = styled.div.attrs({
  className: "BreadcrumbsWrapper",
})`
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const BreadcrumbsItem = styled.span.attrs({
  className: "BreadcrumbsItem",
})<{ $active?: boolean }>`
  position: relative;
  padding: 10px 25px;
  cursor: pointer;
  background-color: ${({ $active }) => ($active ? "#2196F3" : "transparent")};
  color: ${({ $active }) => ($active ? "#fff" : "#fff")};
  font-weight: ${({ $active }) => ($active ? "600" : "normal")};
  transition: all 0.2s ease-in-out;
  display: inline-block;
  margin-right: -5px;
  clip-path: polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%, 15% 50%);

  &:hover {
    background-color: ${({ $active }) => ($active ? "#1976D2" : "transparent")};
    color: #fff;
  }
`;

export const HeaderActionsWrapper = styled.div.attrs({
  className: "HeaderActionsWrapper",
})`
  justify-self: end;
  padding-right: 2px;
`;

export const SidebarContainer = styled.div.attrs({
  className: "SidebarContainer",
})`
  background-color: #ffffff;
  padding: 20px;
  border-right: 1px solid #ccc;
  min-height: 100vh;
`;

export const ButtonGroup = styled.div.attrs({
  className: "ButtonGroup",
})`
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
`;

export const ViewButton = styled.button.attrs({
  className: "ViewButton",
})<{ $active: boolean }>`
  background-color: ${({ $active }) => ($active ? "#007bff" : "#e0e0e0")};
  color: ${({ $active }) => ($active ? "#fff" : "#000")};
  border: none;
  padding: 10px 20px;
  margin: 0 5px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${({ $active }) => ($active ? "#0056b3" : "#ccc")};
  }
`;

interface ButtonProps {
  $small?: boolean;
}

const BaseButton = styled.button.attrs(() => ({
  className: "BaseButton",
}))<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 5px;
  padding: ${({ $small }) => ($small ? "6px 12px" : "10px 20px")};
  font-size: ${({ $small }) => ($small ? "14px" : "16px")};
  border-radius: 5px;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s, opacity 0.2s, border-color 0.2s;

  &:disabled {
    color: rgb(107, 124, 147);
    background-color: rgb(255, 255, 255);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;



// ✅ Primary Button
export const PrimaryButton = styled(BaseButton).attrs({
  className: "PrimaryButton",
})`
  background-color: #007bff;
  color: #fff;
  border: none;

  &:hover {
    background-color: #0056b3;
  }
`;

// ✅ Light Button
export const LightButton = styled(BaseButton).attrs({
  className: "LightButton",
})`
  background-color: #ffff;
  color: #333;
  border: 1px solid #ccc;

  &:hover {
    background-color: #e2e6ea;
    border-color: #bfc2c5;
  }
`;

export const IconButton = styled(BaseButton)<{ $active?: boolean }>`
  background-color: transparent;
  border: none;
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 18px;
    color: ${({ $active }) => ($active ? "#007bff" : "#333")};
    transition: color 0.2s ease-in-out;
  }

  &:hover i {
    color: ${({ $active }) => ($active ? "#0056b3" : "#666")};
  }
`;



// Item in the Toolbox (Add Text, Add Section, Add Columns)
export const ToolboxItem = styled.div.attrs({
  className: "ToolboxItem",
})`
  margin-bottom: 10px;
  padding: 10px;
  background-color: #e0e0e0;
  cursor: pointer;
  text-align: center;
  border-radius: 5px;

  &:hover {
    background-color: #d6d6d6;
  }
`;

// UI for the Indicators (shown when an element is selected)
export const IndicatorDiv = styled.div.attrs({
  className: "IndicatorDiv",
})`
  height: 20px;
  margin-top: -30px;
  padding: 5px;
  color: #ffffff;
  background-color: #149EFC;
  position: absolute;
  display: flex;
  align-items: center;
  z-index: 11;
`;

// Control buttons inside the Indicator (Drag, Delete, Move up)
export const IndicatorButton = styled.a.attrs({
  className: "IndicatorButton",
})`
  margin-right: 0.5rem;
  color: #ffffff;
  display: flex;
  align-items: center;
  text-decoration: none;
  cursor: pointer;
  opacity: 0.9;

  > i {
    margin-right: 5px;
  }

  &:hover {
    opacity: 1;
  }
`;

interface ResizerProps {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  position: { top: string; left: string; height: string }; // Added height
}

const ResizerDiv = styled.div.attrs({
  className: "SplitterRow",
})<{ top: string; left: string; height: string }>`
  width: 3px;
  position: absolute;
  left: ${({ left }) => left};
  height: ${({ height }) => height};
  background: #149EFC;
  cursor: col-resize;
  z-index: 1000;
  transition: opacity 0.2s ease-in-out;

  &::after {
    content: "";
    position: absolute;
    top: calc(50% - 10px); /* Center vertically */
    left: -2px; /* Center the resizer handle */
    width: 6px;
    height: 20px;
    border-radius: 1px;
    background-color: rgb(20, 158, 252);
  }
`;

export const Resizer: React.FC<ResizerProps> = ({ onMouseDown, position }) => {
  return <ResizerDiv onMouseDown={onMouseDown} {...position} />;
};


