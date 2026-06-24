import React, { useState, useEffect, useRef } from "react";
import { UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { MenuProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { MenuSettings } from "./MenuSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { Indicator } from "../../editor/common/Indicator";

const MenuContainer = styled.nav<{
  $padding?: MenuProps["padding"];
  $mobilePadding?: MenuProps["mobilePadding"];
  $alignment?: string;
  $mobileAlignment?: string;
}>`
  ${({ $padding, $alignment }) => css`
    ${$padding &&
    `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
    display: flex;
    align-items: center;
    justify-content: ${$alignment || 'flex-start'};
  `}

  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileAlignment }) => css`
      ${$mobilePadding &&
      `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
      ${$mobileAlignment && `justify-content: ${$mobileAlignment};`}
    `}
  }
`;

const HamburgerButton = styled.button<{
  $burgerIconColor?: string;
  $mobileBurgerIconColor?: string;
  $showBurgerMenu?: boolean;
  $viewMode?: string;
}>`
  display: ${({ $showBurgerMenu, $viewMode }) => 
    $showBurgerMenu && $viewMode === 'mobile' ? 'block' : 'none'};
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: ${({ $burgerIconColor }) => $burgerIconColor || '#000000'};
  
  @media (max-width: 800px) {
    display: ${({ $showBurgerMenu }) => $showBurgerMenu ? 'block' : 'none'};
    ${({ $mobileBurgerIconColor }) => $mobileBurgerIconColor && `color: ${$mobileBurgerIconColor};`}
  }
`;

const DesktopMenu = styled.ul<{
  $spaceBetweenItems?: number;
  $mobileSpaceBetweenItems?: number;
  $showBurgerMenu?: boolean;
  $viewMode?: string;
}>`
  display: ${({ $showBurgerMenu, $viewMode }) => 
    $showBurgerMenu && $viewMode === 'mobile' ? 'none' : 'flex'};
  list-style: none;
  margin: 0;
  padding: 0;
  gap: ${({ $spaceBetweenItems }) => $spaceBetweenItems || 23}px;
  
  @media (max-width: 800px) {
    display: ${({ $showBurgerMenu }) => $showBurgerMenu ? 'none' : 'flex'};
    ${({ $mobileSpaceBetweenItems }) => $mobileSpaceBetweenItems && `gap: ${$mobileSpaceBetweenItems}px;`}
  }
`;

const MenuItem = styled.li`
  position: relative;
`;

const MenuLink = styled.a<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $textColor?: string;
  $mobileTextColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
  $underlineColor?: string;
  $mobileUnderlineColor?: string;
  $enabled?: boolean;
}>`
  text-decoration: none;
  display: block;
  padding: 8px 0;
  font-size: ${({ $fontSize }) => $fontSize || 16}px;
  line-height: ${({ $lineHeight }) => $lineHeight || 24}px;
  color: ${({ $textColor }) => $textColor || '#000000'};
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? `font-style: italic;` : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "").trim()};` : ""}
  pointer-events: ${({ $enabled }) => $enabled ? 'none' : 'auto'};
  
  &:hover {
    text-decoration-thickness: 3px;
    text-underline-offset: 10px;
    text-decoration-line: underline;
    text-decoration-color: ${({ $underlineColor }) => $underlineColor || 'transparent'};
  }

  @media (max-width: 800px) {
    ${({ $mobileFontSize }) => $mobileFontSize && `font-size: ${$mobileFontSize}px;`}
    ${({ $mobileLineHeight }) => $mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
    ${({ $mobileTextColor }) => $mobileTextColor && `color: ${$mobileTextColor};`}
      
    &:hover {
      ${({ $mobileUnderlineColor }) => 
        $mobileUnderlineColor && 
        `text-decoration-color: ${$mobileUnderlineColor};`}
    }
  }
`;

const SubmenuContainer = styled.ul<{
  $submenuBackgroundColor?: string;
  $mobileSubmenuBackgroundColor?: string;
  $spaceBetweenSubmenuItems?: number;
  $mobileSpaceBetweenSubmenuItems?: number;
}>`
  position: absolute;
  top: 100%;
  left: 0;
  background-color: ${({ $submenuBackgroundColor }) => $submenuBackgroundColor || '#ffffff'};
  min-width: 200px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  border-radius: 4px;
  list-style: none;
  margin: 0;
  padding: 8px 0;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all 0.2s ease;
  z-index: 1000;
  
  ${MenuItem}:hover & {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  
  li {
    margin-bottom: ${({ $spaceBetweenSubmenuItems }) => $spaceBetweenSubmenuItems || 23}px;
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  @media (max-width: 800px) {
    ${({ $mobileSubmenuBackgroundColor }) => 
      $mobileSubmenuBackgroundColor && `background-color: ${$mobileSubmenuBackgroundColor};`}
      
    li {
      ${({ $mobileSpaceBetweenSubmenuItems }) => 
        $mobileSpaceBetweenSubmenuItems && `margin-bottom: ${$mobileSpaceBetweenSubmenuItems}px;`}
    }
  }
`;

const SubmenuLink = styled.a<{
  $submenuFontSize?: number;
  $mobileSubmenuFontSize?: number;
  $submenuLineHeight?: number;
  $mobileSubmenuLineHeight?: number;
  $submenuTextColor?: string;
  $mobileSubmenuTextColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
  $enabled?: boolean;
  $underlineColor?: string;
  $mobileUnderlineColor?: string;
 }>`
  text-decoration: none;
  display: block;
  padding: 8px 16px;
  font-size: ${({ $submenuFontSize }) => $submenuFontSize || 14}px;
  line-height: ${({ $submenuLineHeight }) => $submenuLineHeight || 18}px;
  color: ${({ $submenuTextColor }) => $submenuTextColor || '#000000'};
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? `font-style: italic;` : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "").trim()};` : ""}
  transition: background-color 0.2s ease;
  pointer-events: ${({ $enabled }) => $enabled ? 'none' : 'auto'};
  white-space: nowrap;
  
  &:hover {
      text-decoration-thickness: 3px;
      text-underline-offset: 10px;
      text-decoration-line: underline;
      text-decoration-color: ${({ $underlineColor }) => $underlineColor || 'transparent'};
  }
  @media (max-width: 800px) {
    ${({ $mobileSubmenuFontSize }) => $mobileSubmenuFontSize && `font-size: ${$mobileSubmenuFontSize}px;`}
    ${({ $mobileSubmenuLineHeight }) => $mobileSubmenuLineHeight && `line-height: ${$mobileSubmenuLineHeight}px;`}
    ${({ $mobileSubmenuTextColor }) => $mobileSubmenuTextColor && `color: ${$mobileSubmenuTextColor};`}
    &:hover {
      ${({ $mobileUnderlineColor }) => 
        $mobileUnderlineColor && 
        `text-decoration-color: ${$mobileUnderlineColor};`}
    }
  }
 `;

const SideMenuOverlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 999;
  opacity: ${({ $isOpen }) => $isOpen ? 1 : 0};
  visibility: ${({ $isOpen }) => $isOpen ? 'visible' : 'hidden'};
  transition: all 0.3s ease;
  display: none;
  
  @media (max-width: 800px) {
    display: block;
  }
`;

const SideMenu = styled.div<{
  $isOpen: boolean;
  $mobileSideMenuBackgroundColor?: string;
}>`
  position: fixed;
  top: 0;
  right: 0;
  width: 250px;
  height: 100vh;
  z-index: 1000;
  transform: translateX(${({ $isOpen }) => $isOpen ? '0' : '100%'});
  transition: transform 0.3s ease;
  padding: 20px;
  box-shadow: -2px 0 10px rgba(0,0,0,0.1); 
  display: none;
  
  @media (max-width: 800px) {
    display: block;
    background-color: ${({ $mobileSideMenuBackgroundColor }) => 
      $mobileSideMenuBackgroundColor || '#ffffff'};
  }
`;

const SideMenuList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

// SideMenuItem for top-level menu items
const SideMenuItem = styled.li<{
  $mobileSpaceBetweenItems?: number;
}>`
  &:last-child {
    margin-bottom: 0;
  }
  @media (max-width: 800px) {
    ${({ $mobileSpaceBetweenItems }) => 
      $mobileSpaceBetweenItems !== undefined ? `margin-bottom: ${$mobileSpaceBetweenItems}px;` : ''}
  }
`;

// SideMenuSubItem for submenu items
const SideMenuSubItem = styled.li<{
  $mobileSpaceBetweenSubmenuItems?: number;
}>`
  &:last-child {
    margin-bottom: 0;
  }
  @media (max-width: 800px) {
    ${({ $mobileSpaceBetweenSubmenuItems }) => 
      $mobileSpaceBetweenSubmenuItems !== undefined ? `margin-bottom: ${$mobileSpaceBetweenSubmenuItems}px;` : ''}
  }
`;

const SideMenuHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  cursor: pointer;
  user-select: none;
`;

const ChevronButton = styled.button<{
  $isExpanded: boolean;
  $burgerIconColor?: string;
  $mobileBurgerIconColor?: string;
}>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: ${({ $burgerIconColor }) => $burgerIconColor || '#000000'};
  transform: ${({ $isExpanded }) => $isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
  transition: transform 0.2s ease;
  
  @media (max-width: 800px) {
    ${({ $mobileBurgerIconColor }) => $mobileBurgerIconColor && `color: ${$mobileBurgerIconColor};`}
  }
`;

const SideSubmenuContainer = styled.div<{
  $isExpanded: boolean;
  $mobileSpaceBetweenSubmenuItems?: number;
  $submenuBackgroundColor?: string;
  $mobileSubmenuBackgroundColor?: string;
}>`
  overflow: hidden;
  max-height: ${({ $isExpanded }) => $isExpanded ? '1000px' : '0'};
  transition: max-height 0.3s ease;
  margin-top: ${({ $isExpanded }) => $isExpanded ? '8px' : '0'};
  padding-left: 16px;
  background-color: ${({ $submenuBackgroundColor }) => $submenuBackgroundColor};
  
  @media (max-width: 800px) {
    ${({ $mobileSubmenuBackgroundColor }) => 
      $mobileSubmenuBackgroundColor && `background-color: ${$mobileSubmenuBackgroundColor};`}
  }
`;

const CloseButton = styled.button<{
  $burgerIconColor?: string;
  $mobileBurgerIconColor?: string;
}>`
  background: none;
  border: none;
  padding: 0;
  font-size: 30px;
  cursor: pointer;
  color: ${({ $burgerIconColor }) => $burgerIconColor || '#000000'};
  
  @media (max-width: 800px) {
    ${({ $mobileBurgerIconColor }) => $mobileBurgerIconColor && `color: ${$mobileBurgerIconColor};`}
  }
`;

export const Menu: UserComponent<MenuProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("menu", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [expandedSubmenu, setExpandedSubmenu] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    // Menu specific props
    items: props.items || [],
    showBurgerMenu: props.showBurgerMenu,
    burgerIconColor: getValueByViewMode(viewMode, props.burgerIconColor, props.mobileBurgerIconColor),
    mobileSideMenuBackgroundColor: props.mobileSideMenuBackgroundColor,
    menuType: props.menuType,
    alignment: getValueByViewMode(viewMode, props.alignment, props.mobileAlignment),
    spaceBetweenItems: getValueByViewMode(viewMode, props.spaceBetweenItems, props.mobileSpaceBetweenItems),
    spaceBetweenSubmenuItems: getValueByViewMode(viewMode, props.spaceBetweenSubmenuItems, props.mobileSpaceBetweenSubmenuItems),
    fontSize: getValueByViewMode(viewMode, props.fontSize, props.mobileFontSize),
    lineHeight: getValueByViewMode(viewMode, props.lineHeight, props.mobileLineHeight),
    textColor: getValueByViewMode(viewMode, props.textColor, props.mobileTextColor),
    submenuTextColor: getValueByViewMode(viewMode, props.submenuTextColor, props.mobileSubmenuTextColor),
    submenuBackgroundColor: getValueByViewMode(viewMode, props.submenuBackgroundColor, props.mobileSubmenuBackgroundColor),
    submenuFontSize: getValueByViewMode(viewMode, props.submenuFontSize, props.mobileSubmenuFontSize),
    submenuLineHeight: getValueByViewMode(viewMode, props.submenuLineHeight, props.mobileSubmenuLineHeight),
    underlineColor: getValueByViewMode(viewMode, props.underlineColor, props.mobileUnderlineColor),
    
    // Non-responsive props
    fontFamily: props.fontFamily,
    fontStyle: props.fontStyle,
    mobileAlignment: props.mobileAlignment,
    mobileBurgerIconColor: props.mobileBurgerIconColor,
    // Mobile props for wrapper
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileSpaceBetweenItems: props.mobileSpaceBetweenItems,
    mobileSpaceBetweenSubmenuItems: props.mobileSpaceBetweenSubmenuItems,
    mobileSubmenuBackgroundColor: props.mobileSubmenuBackgroundColor,
    mobileFontSize: props.mobileFontSize,
    mobileLineHeight: props.mobileLineHeight,
    mobileTextColor: props.mobileTextColor,
    mobileUnderlineColor: props.mobileUnderlineColor,

    mobileSubmenuFontSize: props.mobileSubmenuFontSize,
    mobileSubmenuLineHeight: props.mobileSubmenuLineHeight,
    mobileSubmenuTextColor: props.mobileSubmenuTextColor,
  };
  // Close side menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsSideMenuOpen(false);
      }
    };

    if (isSideMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSideMenuOpen]);

  const toggleSideMenu = () => {
    setIsSideMenuOpen(!isSideMenuOpen);
  };

  const toggleSubmenu = (itemId: string) => {
    setExpandedSubmenu(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const renderMenuItem = (item: any, isSubmenu = false) => {
    if (isSubmenu) {
      return (
        <SubmenuLink
          href={item.link || '#'}
          target={item.openInNewWindow ? '_blank' : undefined}
          rel={item.openInNewWindow ? 'noopener noreferrer' : undefined}
          $submenuFontSize={resolvedProps.submenuFontSize}
          $mobileSubmenuFontSize={resolvedProps.mobileSubmenuFontSize}
          $submenuLineHeight={resolvedProps.submenuLineHeight}
          $mobileSubmenuLineHeight={resolvedProps.mobileSubmenuLineHeight}
          $submenuTextColor={resolvedProps.submenuTextColor}
          $mobileSubmenuTextColor={resolvedProps.mobileSubmenuTextColor}
          $underlineColor={resolvedProps.underlineColor}
          $mobileUnderlineColor={resolvedProps.mobileUnderlineColor}
          $fontFamily={resolvedProps.fontFamily}
          $fontStyle={resolvedProps.fontStyle}
          $enabled={enabled}
        >
          {item.text}
        </SubmenuLink>
      );
    }

    return (
      <MenuLink
        href={item.link || '#'}
        target={item.openInNewWindow ? '_blank' : undefined}
        rel={item.openInNewWindow ? 'noopener noreferrer' : undefined}
        $fontSize={resolvedProps.fontSize}
        $mobileFontSize={resolvedProps.mobileFontSize}
        $lineHeight={resolvedProps.lineHeight}
        $mobileLineHeight={resolvedProps.mobileLineHeight}
        $textColor={resolvedProps.textColor}
        $mobileTextColor={resolvedProps.mobileTextColor}
        $fontFamily={resolvedProps.fontFamily}
        $fontStyle={resolvedProps.fontStyle}
        $underlineColor={resolvedProps.underlineColor}
        $mobileUnderlineColor={resolvedProps.mobileUnderlineColor}
        $enabled={enabled}
    >
      {item.text}
    </MenuLink>
    );
  };

  const renderDesktopMenu = () => (
    <DesktopMenu
      $spaceBetweenItems={resolvedProps.spaceBetweenItems}
      $mobileSpaceBetweenItems={resolvedProps.mobileSpaceBetweenItems}
      $showBurgerMenu={resolvedProps.showBurgerMenu}
      $viewMode={viewMode}
    >
      {resolvedProps.items.map((item) => (
        <MenuItem key={item.id}>
          {renderMenuItem(item)}
          {item.hasSubmenu && item.submenuItems && item.submenuItems.length > 0 && (
            <SubmenuContainer
              $submenuBackgroundColor={resolvedProps.submenuBackgroundColor}
              $mobileSubmenuBackgroundColor={resolvedProps.mobileSubmenuBackgroundColor}
              $spaceBetweenSubmenuItems={resolvedProps.spaceBetweenSubmenuItems}
              $mobileSpaceBetweenSubmenuItems={resolvedProps.mobileSpaceBetweenSubmenuItems}
            >
              {item.submenuItems.map((submenuItem) => (
                <li key={submenuItem.id}>
                  {renderMenuItem(submenuItem, true)}
                </li>
              ))}
            </SubmenuContainer>
          )}
        </MenuItem>
      ))}
    </DesktopMenu>
  );

  const renderSideMenu = () => (
    <>
      <SideMenuOverlay 
        $isOpen={isSideMenuOpen} 
        onClick={() => setIsSideMenuOpen(false)}
      />
      <SideMenu
        ref={menuRef}
        $isOpen={isSideMenuOpen}
        $mobileSideMenuBackgroundColor={resolvedProps.mobileSideMenuBackgroundColor}
      >
        <CloseButton
          onClick={() => setIsSideMenuOpen(false)}
          $burgerIconColor={resolvedProps.burgerIconColor}
          $mobileBurgerIconColor={resolvedProps.mobileBurgerIconColor}
        >
          <i className="fas fa-times"></i>
        </CloseButton>
        <SideMenuList>
          {resolvedProps.items.map((item) => (
            <SideMenuItem 
              key={item.id}
              $mobileSpaceBetweenItems={resolvedProps.mobileSpaceBetweenItems}
            >
              {item.hasSubmenu && item.submenuItems && item.submenuItems.length > 0 ? (
                <>
                  <SideMenuHeader onClick={() => toggleSubmenu(item.id)}>
                    {renderMenuItem(item)}
                    <ChevronButton
                      $isExpanded={expandedSubmenu.includes(item.id)}
                      $burgerIconColor={resolvedProps.burgerIconColor}
                      $mobileBurgerIconColor={resolvedProps.mobileBurgerIconColor}
                      as="div"
                    >
                      <i className="fas fa-chevron-down"></i>
                    </ChevronButton>
                  </SideMenuHeader>
                  <SideSubmenuContainer 
                    $isExpanded={expandedSubmenu.includes(item.id)}
                    $mobileSpaceBetweenSubmenuItems={resolvedProps.mobileSpaceBetweenSubmenuItems}
                    $submenuBackgroundColor={resolvedProps.submenuBackgroundColor}
                    $mobileSubmenuBackgroundColor={resolvedProps.mobileSubmenuBackgroundColor}
                  >
                    <SideMenuList>
                      {item.submenuItems.map((submenuItem) => (
                        <SideMenuSubItem 
                          key={submenuItem.id}
                          $mobileSpaceBetweenSubmenuItems={resolvedProps.mobileSpaceBetweenSubmenuItems}
                        >
                          {renderMenuItem(submenuItem, true)}
                        </SideMenuSubItem>
                      ))}
                    </SideMenuList>
                  </SideSubmenuContainer>
                </>
              ) : (
                renderMenuItem(item)
              )}
            </SideMenuItem>
          ))}
        </SideMenuList>
      </SideMenu>
    </>
  );

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Menu">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={resolvedProps.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault=""
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Menu"} /> : null}
          <MenuContainer
            id={props.htmlAttrId || elementId}
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $alignment={resolvedProps.alignment}
            $mobileAlignment={resolvedProps.mobileAlignment}
          >
            <HamburgerButton
              onClick={toggleSideMenu}
              $burgerIconColor={resolvedProps.burgerIconColor}
              $mobileBurgerIconColor={resolvedProps.mobileBurgerIconColor}
              $showBurgerMenu={resolvedProps.showBurgerMenu}
              $viewMode={viewMode}
            >
              <i className="fas fa-bars"></i>
            </HamburgerButton>
            
            {renderDesktopMenu()}
          </MenuContainer>
          
          {resolvedProps.showBurgerMenu && resolvedProps.menuType === 'side' && renderSideMenu()}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Menu.craft = {
  props: { ...DEFAULT_STYLES.menu },
  related: { settings: MenuSettings },
  displayName: "Menu",
};