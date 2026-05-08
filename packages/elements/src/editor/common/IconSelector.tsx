import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconSelectorContainer, 
  IconModal, 
  SearchInput, 
  SectionTitle, 
  IconGrid, 
  ScrollableIconGrid, 
  IconButton, 
  Section, 
  Divider, 
} from '../../elements/BulletedList/BulletedListStyle';
import { ToolbarButton, ButtonGroup } from './ElementToolBarUI';
import iconsData from '../../data/icons.json';

// Define the interface for the icon data structure
interface IconsDataType {
  font_awesome: string[];
  bootstrap_icons: string[];
  [key: string]: string[];
}

// Common icons
const DEFAULT_POPULAR_ICONS = [
  'fas fa-check',
  'fas fa-check-double',
  'fas fa-square-check',
  'fas fa-circle-check',
  'fas fa-circle',
  'fas fa-arrow-right',
  'fas fa-right-long',
  'fas fa-chevron-up',
  'fas fa-angle-down',
  'fas fa-lightbulb',
  'fas fa-circle-exclamation',
  'fas fa-chevron-right',
  'fas fa-angle-right',
  'bi bi-check-circle',
  'bi bi-check-square'
];

interface IconSelectorProps {
  currentIconType: string;
  onSelectIcon: (iconType: string) => void;
  popularIcons?: string[];
  portalContainerSelector?: string;
  renderButton?: (toggleModal: () => void) => React.ReactNode;
}

const IconSelector: React.FC<IconSelectorProps> = ({
  currentIconType,
  onSelectIcon,
  popularIcons = DEFAULT_POPULAR_ICONS,
  portalContainerSelector = '.ContentUi',
  renderButton
}) => {
  const [showIconModal, setShowIconModal] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(100);
  
  const modalRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);

  const LOAD_MORE_SIZE = 100;

  // Process ALL icons from all libraries into one flat array
  const allIcons = useMemo(() => {
    try {
      const typedIconsData = iconsData as IconsDataType;
      const allIconsArray: string[] = [];
      
      // Combine all icons from all libraries
      Object.keys(typedIconsData).forEach(libraryKey => {
        if (Array.isArray(typedIconsData[libraryKey])) {
          allIconsArray.push(...typedIconsData[libraryKey]);
        }
      });
      
      // If no icons were processed, use fallback
      if (allIconsArray.length === 0) {
        return DEFAULT_POPULAR_ICONS;
      }
      
      return allIconsArray;
    } catch (error) {
      console.error("Error processing icons:", error);
      return DEFAULT_POPULAR_ICONS;
    }
  }, []);
  
  // Filter icons based on search term
  const filteredIcons = useMemo(() => {
    if (!searchTerm) return allIcons;
    
    return allIcons.filter(icon => {
      const iconText = icon.toLowerCase();
      const search = searchTerm.toLowerCase();
      return iconText.includes(search);
    });
  }, [allIcons, searchTerm]);

  // Icons displayed with a count limit
  const visibleIcons = useMemo(() => {
    return filteredIcons.slice(0, displayedCount);
  }, [filteredIcons, displayedCount]);

  // Check whether more can be loaded
  const hasMore = useMemo(() => {
    return filteredIcons.length > displayedCount;
  }, [filteredIcons.length, displayedCount]);

  // Reset displayed count when the search term changes
  useEffect(() => {
    setDisplayedCount(100);
  }, [searchTerm]);

  // Load more function
  const loadMore = useCallback(() => {
    setDisplayedCount(prev => Math.min(prev + LOAD_MORE_SIZE, filteredIcons.length));
  }, [filteredIcons.length, LOAD_MORE_SIZE]);

  // Calculate modal position to ensure it's always visible in viewport
  const calculateModalPosition = useCallback((buttonRect: DOMRect) => {
    // Get viewport dimensions
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate default position (below the button)
    let top = buttonRect.bottom + window.scrollY + 5;
    let left = buttonRect.left + window.scrollX;
    
    // Check if modal would render outside bottom of viewport
    const estimatedModalHeight = 400;
    
    if (top + estimatedModalHeight > window.scrollY + viewportHeight) {
      // Position modal above button instead
      top = buttonRect.top + window.scrollY - estimatedModalHeight - 5;
    }
    
    // Check if modal would render outside right edge
    const estimatedModalWidth = 320;
    
    if (left + estimatedModalWidth > window.scrollX + viewportWidth) {
      // Align to right edge of button
      left = buttonRect.right + window.scrollX - estimatedModalWidth;
    }
    
    // Ensure we don't position off-screen to the left
    if (left < 0) {
      left = 10;
    }
    
    // Ensure we don't position off-screen at the top
    if (top < 0) {
      top = 10;
    }
    
    return { top, left };
  }, []);
  
  // Update modal position when showing
  useLayoutEffect(() => {
    if (showIconModal && buttonRef.current) {
      setIsPositioned(false);
      const rect = buttonRef.current.getBoundingClientRect();
      const position = calculateModalPosition(rect);
      setModalPosition(position);
      
      // Set positioned to true after a small delay to allow position to be set
      setTimeout(() => {
        setIsPositioned(true);
      }, 10);
    }
  }, [showIconModal, calculateModalPosition]);

  // Reset positioned state when modal closes
  useEffect(() => {
    if (!showIconModal) {
      setIsPositioned(false);
    }
  }, [showIconModal]);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current && 
        !modalRef.current.contains(event.target as Node) &&
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowIconModal(false);
        setSearchTerm('');
      }
    };
    
    if (showIconModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showIconModal]);

  // Get icon name without prefix for tooltip
  const getIconName = useCallback((iconClass: string) => {
    // Handle different icon libraries
    if (iconClass.startsWith('fas ') || iconClass.startsWith('far ') || iconClass.startsWith('fab ')) {
      return iconClass.replace(/^(fas|far|fab) fa-/, '').replace(/-/g, ' ');
    } else if (iconClass.startsWith('bi ')) {
      return iconClass.replace(/^bi bi-/, '').replace(/-/g, ' ');
    }
    return iconClass;
  }, []);

  // Toggle icon modal
  const toggleIconModal = useCallback(() => {
    setShowIconModal(prev => !prev);
    if (!showIconModal) {
      setSearchTerm('');
    }
  }, [showIconModal]);

  // Handle icon selection
  const handleIconSelect = useCallback((iconType: string) => {
    onSelectIcon(iconType);
    setShowIconModal(false);
    setSearchTerm('');
  }, [onSelectIcon]);

  return (
    <IconSelectorContainer>
        {renderButton ? (
          <div ref={buttonRef}>
            {renderButton(toggleIconModal)}
          </div>
        ) : (
          <ButtonGroup ref={buttonRef}>
            <ToolbarButton
              onClick={toggleIconModal}
              $active={false}
              title="Choose icon"
            >
              <i className={currentIconType}></i>
              <i className="fas fa-caret-down" style={{ marginLeft: '5px' }}></i>
            </ToolbarButton>
          </ButtonGroup>
        )}
      {showIconModal && createPortal(
        <IconModal 
          ref={modalRef}
          style={{
            top: `${modalPosition.top}px`,
            left: `${modalPosition.left}px`,
            opacity: isPositioned ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          {/* Search bar */}
          <Section>
            <SearchInput
              type="text"
              placeholder="Search icons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </Section>
          
          {/* Popular icons section */}
          {popularIcons.length > 0 && (
            <Section>
              <SectionTitle>Popular icons:</SectionTitle>
              <IconGrid>
                {popularIcons.map((iconClass, index) => (
                  <IconButton
                    key={`popular-${index}`}
                    onClick={() => handleIconSelect(iconClass)}
                    $active={currentIconType === iconClass}
                    title={getIconName(iconClass)}
                  >
                    <i className={iconClass}></i>
                  </IconButton>
                ))}
              </IconGrid>
            </Section>
          )}
          
          {popularIcons.length > 0 && <Divider />}
          
          {/* All icons section */}
          <Section>
            <SectionTitle>
              {searchTerm ? 'Search results:' : 'All icons:'}
            </SectionTitle>
            
            {/* Show "No icons found" message outside of grid */}
            {visibleIcons.length === 0 ? (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                color: '#666',
                fontSize: '14px'
              }}>
                No icons found matching your search
              </div>
            ) : (
              <ScrollableIconGrid>
                {visibleIcons.map((iconClass, index) => (
                  <IconButton
                    key={`all-${index}`}
                    onClick={() => handleIconSelect(iconClass)}
                    $active={currentIconType === iconClass}
                    title={getIconName(iconClass)}
                  >
                    <i className={iconClass}></i>
                  </IconButton>
                ))}
                
                {/* Load More Button - Positioned at the bottom of the scrollable grid */}
                {hasMore && (
                  <div style={{ 
                    gridColumn: '1 / -1', // Span across all columns
                    padding: '10px', 
                    textAlign: 'center'
                  }}>
                    <button
                      onClick={loadMore}
                      style={{
                        padding: '6px 12px',
                        background: '#f8f9fa',
                        color: '#6c757d',
                        border: '1px solid #dee2e6',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '400'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#e9ecef';
                        e.currentTarget.style.borderColor = '#adb5bd';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#f8f9fa';
                        e.currentTarget.style.borderColor = '#dee2e6';
                      }}
                    >
                      Load More
                    </button>
                  </div>
                )}
              </ScrollableIconGrid>
            )}
          </Section>
        </IconModal>,
        document.querySelector(portalContainerSelector) || document.body
      )}
    </IconSelectorContainer>
  );
};

export default IconSelector;