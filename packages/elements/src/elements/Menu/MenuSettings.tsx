import React, { useState } from "react";
import { useNode } from "@launchtic/editor-core";
import { MenuProps, MenuItemProps, MenuSubmenuItemProps, MenuAlignment } from "../ElementProps";
import { 
  SettingsGroupLarge, 
  Label, 
  SliderControl, 
  CheckboxWrapper, 
  CheckboxInput,
  LightButton,
  Select,
  Input,
  InputGroup
} from "../../editor/common/SettingsUI";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { AlignSelfSettings } from "../../editor/toolbar/AlignSelfSettings";
import { SpacingMenuSettings } from "../../editor/toolbar/SpacingMenuSettings";

import { useAppContext } from "../../contexts/AppContext";
import styled from "styled-components";

const MenuItemContainer = styled.div<{ $isVisible: boolean }>`
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 10px;
  transition: all 0.2s ease;
`;

const MenuItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
  gap: 10px;
  
  &:hover {
    background: #e9ecef;
  }
  
  .item-text {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
    font-size: 14px;
  }
  
  .controls {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
  }
`;

const MenuItemContent = styled.div<{ $isOpen: boolean }>`
  max-height: ${({ $isOpen }) => $isOpen ? '1000px' : '0'};
  overflow: hidden;
  transition: max-height 0.3s ease;
  padding: ${({ $isOpen }) => $isOpen ? '15px' : '0 15px'};
`;

const SubmenuContainer = styled.div`
  margin-top: 15px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
`;

const SubmenuItemContainer = styled.div`
  background: #ffffff;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 8px;
  padding: 10px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const SubmenuItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  
  .submenu-title {
    font-size: 12px;
    font-weight: bold;
  }
  
  .submenu-controls {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
  }
`;


export const MenuSettings: React.FC = () => {
  const { viewMode } = useAppContext();
  const {
    actions: { setProp },
    items,
    showBurgerMenu,
    burgerIconColor,
    mobileBurgerIconColor,
    menuType,
    mobileSideMenuBackgroundColor,
    alignment,
    mobileAlignment,
    spaceBetweenItems,
    mobileSpaceBetweenItems,
    spaceBetweenSubmenuItems,
    mobileSpaceBetweenSubmenuItems,
    fontSize,
    mobileFontSize,
    lineHeight,
    mobileLineHeight,
    fontType,
    fontFamily,
    fontStyle,
    textColor,
    mobileTextColor,
    submenuTextColor,
    mobileSubmenuTextColor,
    submenuBackgroundColor,
    mobileSubmenuBackgroundColor,
    submenuFontSize,
    mobileSubmenuFontSize,
    submenuLineHeight,
    mobileSubmenuLineHeight,
    underlineColor,
    mobileUnderlineColor,
    appearance,
    delay,
    margin,
    mobileMargin,
    padding,
    mobilePadding,
  } = useNode<MenuProps>((node) => ({
    items: node.data.props.items,
    showBurgerMenu: node.data.props.showBurgerMenu,
    burgerIconColor: node.data.props.burgerIconColor,
    mobileBurgerIconColor: node.data.props.mobileBurgerIconColor,
    menuType: node.data.props.menuType,
    mobileSideMenuBackgroundColor: node.data.props.mobileSideMenuBackgroundColor,
    alignment: node.data.props.alignment,
    mobileAlignment: node.data.props.mobileAlignment,
    spaceBetweenItems: node.data.props.spaceBetweenItems,
    mobileSpaceBetweenItems: node.data.props.mobileSpaceBetweenItems,
    spaceBetweenSubmenuItems: node.data.props.spaceBetweenSubmenuItems,
    mobileSpaceBetweenSubmenuItems: node.data.props.mobileSpaceBetweenSubmenuItems,
    fontSize: node.data.props.fontSize,
    mobileFontSize: node.data.props.mobileFontSize,
    lineHeight: node.data.props.lineHeight,
    mobileLineHeight: node.data.props.mobileLineHeight,
    fontType: node.data.props.fontType,
    fontFamily: node.data.props.fontFamily,
    fontStyle: node.data.props.fontStyle,
    textColor: node.data.props.textColor,
    mobileTextColor: node.data.props.mobileTextColor,
    submenuTextColor: node.data.props.submenuTextColor,
    mobileSubmenuTextColor: node.data.props.mobileSubmenuTextColor,
    submenuBackgroundColor: node.data.props.submenuBackgroundColor,
    mobileSubmenuBackgroundColor: node.data.props.mobileSubmenuBackgroundColor,
    submenuFontSize: node.data.props.submenuFontSize,
    mobileSubmenuFontSize: node.data.props.mobileSubmenuFontSize,
    submenuLineHeight: node.data.props.submenuLineHeight,
    mobileSubmenuLineHeight: node.data.props.mobileSubmenuLineHeight,
    underlineColor: node.data.props.underlineColor,
    mobileUnderlineColor: node.data.props.mobileUnderlineColor,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
  }));

  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const updateProp = <K extends keyof MenuProps>(key: K) => (value: MenuProps[K]) => {
    setProp((props: MenuProps) => {
      props[key] = value;
    });
  };

  const addMenuItem = () => {
    const newItem: MenuItemProps = {
      id: `menu-${Date.now()}`,
      text: "Menu Item",
      link: "#",
      hasSubmenu: false,
      submenuItems: [],
      openInNewWindow: false
    };
    
    updateProp("items")([...items, newItem]);
  };

  const updateMenuItem = (index: number, updatedItem: MenuItemProps) => {
    const newItems = [...items];
    newItems[index] = updatedItem;
    updateProp("items")(newItems);
  };

  const deleteMenuItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    updateProp("items")(newItems);
  };

  const toggleItemEdit = (itemId: string) => {
    setOpenItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newItems.length) {
      [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
      updateProp("items")(newItems);
    }
  };

  const addSubmenuItem = (menuIndex: number) => {
    const newSubmenuItem: MenuSubmenuItemProps = {
      id: `submenu-${Date.now()}`,
      text: "Submenu Item",
      link: "#",
      openInNewWindow: false
    };

    const updatedItem = {
      ...items[menuIndex],
      hasSubmenu: true,
      submenuItems: [...(items[menuIndex].submenuItems || []), newSubmenuItem]
    };

    updateMenuItem(menuIndex, updatedItem);
  };

  const updateSubmenuItem = (menuIndex: number, submenuIndex: number, updatedSubmenuItem: MenuSubmenuItemProps) => {
    const updatedItem = {
      ...items[menuIndex],
      submenuItems: items[menuIndex].submenuItems?.map((item, i) => 
        i === submenuIndex ? updatedSubmenuItem : item
      ) || []
    };

    updateMenuItem(menuIndex, updatedItem);
  };

  const deleteSubmenuItem = (menuIndex: number, submenuIndex: number) => {
    const updatedSubmenuItems = items[menuIndex].submenuItems?.filter((_, i) => i !== submenuIndex) || [];
    const updatedItem = {
      ...items[menuIndex],
      submenuItems: updatedSubmenuItems,
      hasSubmenu: updatedSubmenuItems.length > 0
    };

    updateMenuItem(menuIndex, updatedItem);
  };

  // Helper to reorder submenu items
  const moveSubmenuItem = (menuIndex: number, submenuIndex: number, direction: 'up' | 'down') => {
    const submenuItems = [...(items[menuIndex].submenuItems || [])];
    const targetIndex = direction === 'up' ? submenuIndex - 1 : submenuIndex + 1;
    
    if (targetIndex >= 0 && targetIndex < submenuItems.length) {
      [submenuItems[submenuIndex], submenuItems[targetIndex]] = [submenuItems[targetIndex], submenuItems[submenuIndex]];
      
      const updatedItem = {
        ...items[menuIndex],
        submenuItems: submenuItems
      };

      updateMenuItem(menuIndex, updatedItem);
    }
  };

  return (
    <>
      {/* Hamburger Menu Settings - Only show in mobile mode */}
      {viewMode === "mobile" && (
        <SettingsGroupLarge>
          <Label>Hamburger Menu</Label>
          
          <CheckboxWrapper>
            <Label>Show burger menu</Label>
            <CheckboxInput
              checked={showBurgerMenu || false}
              onChange={(e) => updateProp("showBurgerMenu")(e.target.checked)}
            />
          </CheckboxWrapper>

          {showBurgerMenu && (
            <>
              <TextColorSettings
                color={{ mobile: mobileBurgerIconColor, desktop: burgerIconColor }}
                setColor={(value) => {
                  updateProp("burgerIconColor")(value.desktop);
                  updateProp("mobileBurgerIconColor")(value.mobile);
                }}
                label="Burger icon color"
              />

              <InputGroup>
                <Select
                  value={menuType || 'side'}
                  onChange={(e) => updateProp("menuType")(e.target.value as any)}
                >
                  <option value="side">Side menu</option>
                </Select>
              </InputGroup>

              {menuType === 'side' && (
                <BackgroundColorSettings
                  backgroundColor={{ mobile: mobileSideMenuBackgroundColor, desktop: undefined }}
                  setBackgroundColor={(value) => {
                    updateProp("mobileSideMenuBackgroundColor")(value.mobile);
                  }}
                  label="Side menu background color"
                />
              )}
            </>
          )}
        </SettingsGroupLarge>
      )}

      {/* Menu Items Management */}
      <SettingsGroupLarge>
        <Label>Menu Items</Label>
        
        {items.map((item, index) => (
          <MenuItemContainer key={item.id} $isVisible={true}>
            <MenuItemHeader onClick={() => toggleItemEdit(item.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>{index + 1}</span>
                <span className="item-text" style={{ fontWeight: 'bold' }}>{item.text}</span>
              </div>
              <div className="controls">
                <i 
                  className="fas fa-chevron-up" 
                  onClick={(e) => { e.stopPropagation(); moveItem(index, 'up'); }}
                  style={{ cursor: 'pointer', opacity: index === 0 ? 0.3 : 1 }}
                />
                <i 
                  className="fas fa-chevron-down" 
                  onClick={(e) => { e.stopPropagation(); moveItem(index, 'down'); }}
                  style={{ cursor: 'pointer', opacity: index === items.length - 1 ? 0.3 : 1 }}
                />
                <i 
                  className="fas fa-trash" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (window.confirm('Are you sure you want to delete this menu item?')) {
                      deleteMenuItem(index);
                    }
                  }}
                  style={{ cursor: 'pointer', color: '#dc3545' }}
                />
              </div>
            </MenuItemHeader>
            
            <MenuItemContent $isOpen={openItems.has(item.id)}>
              <InputGroup>
                <Label $small>Menu Text</Label>
                <Input
                  value={item.text}
                  onChange={(e) => updateMenuItem(index, { ...item, text: e.target.value })}
                  placeholder="Enter menu text"
                />
              </InputGroup>
              
              <InputGroup>
                <Label $small>Link URL</Label>
                <Input
                  value={item.link || ''}
                  onChange={(e) => updateMenuItem(index, { ...item, link: e.target.value })}
                  placeholder="Enter link URL"
                />
              </InputGroup>

              <CheckboxWrapper>
                <Label $small>Open in new window</Label>
                <CheckboxInput
                  checked={item.openInNewWindow || false}
                  onChange={(e) => updateMenuItem(index, { ...item, openInNewWindow: e.target.checked })}
                />
              </CheckboxWrapper>

              <CheckboxWrapper>
                <Label $small>Has submenu</Label>
                <CheckboxInput
                  checked={item.hasSubmenu || false}
                  onChange={(e) => updateMenuItem(index, { 
                    ...item, 
                    hasSubmenu: e.target.checked,
                    // Keep submenuItems on uncheck, just hide them
                    submenuItems: item.submenuItems || []
                  })}
                />
              </CheckboxWrapper>

              {item.hasSubmenu && (
                <SubmenuContainer>
                  <Label $small>Submenu Items</Label>
                  {item.submenuItems?.map((submenuItem, submenuIndex) => (
                    <SubmenuItemContainer key={submenuItem.id}>
                      {/* Header with controls for the submenu item */}
                      <SubmenuItemHeader>
                        <span className="submenu-title">Submenu {submenuIndex + 1}</span>
                        <div className="submenu-controls">
                          <i 
                            className="fas fa-chevron-up" 
                            onClick={() => moveSubmenuItem(index, submenuIndex, 'up')}
                            style={{ 
                              cursor: 'pointer', 
                              opacity: submenuIndex === 0 ? 0.3 : 1,
                              fontSize: '12px',
                              marginRight: '5px'
                            }}
                          />
                          <i 
                            className="fas fa-chevron-down" 
                            onClick={() => moveSubmenuItem(index, submenuIndex, 'down')}
                            style={{ 
                              cursor: 'pointer', 
                              opacity: submenuIndex === (item.submenuItems?.length || 1) - 1 ? 0.3 : 1,
                              fontSize: '12px',
                              marginRight: '5px'
                            }}
                          />
                          <i 
                            className="fas fa-trash" 
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this submenu item?')) {
                                deleteSubmenuItem(index, submenuIndex);
                              }
                            }}
                            style={{ cursor: 'pointer', color: '#dc3545', fontSize: '12px' }}
                          />
                        </div>
                      </SubmenuItemHeader>
                      
                      <InputGroup>
                        <Input
                          value={submenuItem.text}
                          onChange={(e) => updateSubmenuItem(index, submenuIndex, { 
                            ...submenuItem, 
                            text: e.target.value 
                          })}
                          placeholder="Submenu text"
                          style={{ marginBottom: '8px' }}
                        />
                        <Input
                          value={submenuItem.link || ''}
                          onChange={(e) => updateSubmenuItem(index, submenuIndex, { 
                            ...submenuItem, 
                            link: e.target.value 
                          })}
                          placeholder="Submenu link"
                          style={{ marginBottom: '8px' }}
                        />
                        <CheckboxWrapper>
                          <Label $small>Open in new window</Label>
                          <CheckboxInput
                            checked={submenuItem.openInNewWindow || false}
                            onChange={(e) => updateSubmenuItem(index, submenuIndex, { 
                              ...submenuItem, 
                              openInNewWindow: e.target.checked 
                            })}
                          />
                        </CheckboxWrapper>
                      </InputGroup>
                    </SubmenuItemContainer>
                  ))}
                  
                  <LightButton 
                    onClick={() => addSubmenuItem(index)} 
                    style={{ width: '100%', marginTop: '10px' }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: '8px' }}></i>
                    ADD SUBMENU ITEM
                  </LightButton>
                </SubmenuContainer>
              )}
            </MenuItemContent>
          </MenuItemContainer>
        ))}
        
        <LightButton onClick={addMenuItem} style={{ width: '100%', marginTop: '10px' }}>
          <i className="fas fa-plus" style={{ marginRight: '8px' }}></i>
          ADD MENU ITEM
        </LightButton>
      </SettingsGroupLarge>

      {/* Alignment Settings */}
      <AlignSelfSettings
        alignSelf={{ mobile: mobileAlignment, desktop: alignment }}
        setAlignSelf={(value) => {
          updateProp("alignment")(value.desktop as MenuAlignment);
          updateProp("mobileAlignment")(value.mobile as MenuAlignment);
        }}
      />

      {/* Margin Settings */}
      <SpacingMenuSettings
        spaceBetweenItems={{ mobile: mobileSpaceBetweenItems, desktop: spaceBetweenItems }}
        setSpaceBetweenItems={(value) => {
          updateProp("spaceBetweenItems")(value.desktop);
          updateProp("mobileSpaceBetweenItems")(value.mobile);
        }}
        spaceBetweenSubmenuItems={{ mobile: mobileSpaceBetweenSubmenuItems, desktop: spaceBetweenSubmenuItems }}
        setSpaceBetweenSubmenuItems={(value) => {
          updateProp("spaceBetweenSubmenuItems")(value.desktop);
          updateProp("mobileSpaceBetweenSubmenuItems")(value.mobile);
        }}
      />

      {/* Typography Settings */}
      <SettingsGroupLarge>
        <Label>Typography</Label>
        
        <FontSizeSettings
          fontSize={{ mobile: mobileFontSize, desktop: fontSize }}
          setFontSize={(value) => {
            updateProp("fontSize")(value.desktop);
            updateProp("mobileFontSize")(value.mobile);
          }}
        />

        <SliderControl
          label="Line height"
          value={viewMode === "mobile" ? (mobileLineHeight ?? lineHeight ?? 24) : (lineHeight ?? 24)}
          min={10}
          max={100}
          onChange={(value) => {
            if (viewMode === "mobile") {
              updateProp("mobileLineHeight")(value);
            } else {
              updateProp("lineHeight")(value);
            }
          }}
        />

        <FontTypeSettings
          fontType={fontType}
          setFontType={updateProp("fontType")}
          fontFamily={fontFamily}
          setFontFamily={updateProp("fontFamily")}
          fontStyle={fontStyle}
          setFontStyle={updateProp("fontStyle")}
        />
      </SettingsGroupLarge>

      {/* Color Settings */}
      <SettingsGroupLarge>
        <Label>Color</Label>
        
        <TextColorSettings
          color={{ mobile: mobileTextColor, desktop: textColor }}
          defaultColor="transparent"
          setColor={(value) => {
            updateProp("textColor")(value.desktop);
            updateProp("mobileTextColor")(value.mobile);
          }}
          label="Menu items text color"
        />

        <TextColorSettings
          color={{ mobile: mobileUnderlineColor, desktop: underlineColor }}
          defaultColor="transparent"
          setColor={(value) => {
            updateProp("underlineColor")(value.desktop);
            updateProp("mobileUnderlineColor")(value.mobile);
          }}
          label="Menu items underline color"
        />
        <TextColorSettings
          color={{ mobile: mobileSubmenuTextColor, desktop: submenuTextColor }}
          defaultColor="transparent"
          setColor={(value) => {
            updateProp("submenuTextColor")(value.desktop);
            updateProp("mobileSubmenuTextColor")(value.mobile);
          }}
          label="Submenu items text color"
        />

        <BackgroundColorSettings
          backgroundColor={{ mobile: mobileSubmenuBackgroundColor, desktop: submenuBackgroundColor }}
          setBackgroundColor={(value) => {
            updateProp("submenuBackgroundColor")(value.desktop);
            updateProp("mobileSubmenuBackgroundColor")(value.mobile);
          }}
          label="Submenu background color"
        />

        
      </SettingsGroupLarge>

      {/* Submenu Typography */}
      <SettingsGroupLarge>
        <Label>Submenu Typography</Label>
        
        <FontSizeSettings
          fontSize={{ mobile: mobileSubmenuFontSize, desktop: submenuFontSize }}
          setFontSize={(value) => {
            updateProp("submenuFontSize")(value.desktop);
            updateProp("mobileSubmenuFontSize")(value.mobile);
          }}
        />

        <SliderControl
          label="Submenu line height"
          value={viewMode === "mobile" ? (mobileSubmenuLineHeight ?? submenuLineHeight ?? 18) : (submenuLineHeight ?? 18)}
          min={10}
          max={50}
          onChange={(value) => {
            if (viewMode === "mobile") {
              updateProp("mobileSubmenuLineHeight")(value);
            } else {
              updateProp("submenuLineHeight")(value);
            }
          }}
        />
      </SettingsGroupLarge>

      {/* Layout Settings */}
      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
      />

      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      {/* Advanced Settings */}
      <DelaySettings delay={delay} setDelay={updateProp("delay")} />
      
      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />
      
      <IDAttributeSettings />
    </>
  );
};