import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/react';
import BaseEditor from '../common/BaseEditor';
import { CustomBulletList } from './CustomBulletList';
import { CustomListItem } from './CustomListItem';
import IconSelector from '../../editor/common/IconSelector';

// Default content - always create a bullet list with icon
const DEFAULT_CONTENT = `<ul>
  <li>
    <i class="fas fa-check"></i>
    <div>Lorem ipsum dolor sit amet, consectetur adipisicing elit</div>
  </li>
</ul>`;

// Common icons for reference
const POPULAR_ICONS = [
  'fas fa-check',
  'fas fa-check-double',
  'far fa-square',
  'fas fa-square-check',
  'fas fa-circle-check',
  'fas fa-circle',
  'fas fa-arrow-right',
  'fas fa-lightbulb',
  'fas fa-circle-exclamation',
  'fas fa-chevron-right',
  'fas fa-angle-right',
  'bi bi-check-circle',
  'bi bi-check-square'
];

interface BulletedListContentProps {
  rawContentState?: string;
}

const BulletedListContent: React.FC<BulletedListContentProps> = ({ rawContentState }) => {
  const [currentIconType, setCurrentIconType] = useState<string>(POPULAR_ICONS[0]);
  const editorRef = useRef<Editor | null>(null);
  
  // Extensions for editor
  const extensions = useMemo(() => [
    CustomBulletList.configure({
      iconClass: currentIconType,
    }) as Extension,
    CustomListItem as Extension,
  ], [currentIconType]);

  // Update all icons in the editor DOM
  const updateAllIcons = useCallback((iconType: string) => {
    if (!editorRef.current) return;
    
    const editorElement = editorRef.current.view.dom;
    const listItems = editorElement.querySelectorAll('ul li > i');
    
    listItems.forEach((icon: Element) => {
      icon.className = iconType;
    });
  }, []);
  
  // Change icon type for all items
  const changeIcon = useCallback((iconType: string) => {
    setCurrentIconType(iconType);
    
    try {
      if (!editorRef.current) return;
      
      const editor = editorRef.current;
      
      // Update editor storage
      if (editor.extensionStorage.customBulletList) {
        editor.extensionStorage.customBulletList.iconClass = iconType;
      }
      
      // Update DOM directly
      updateAllIcons(iconType);
      
      // Trigger gentle re-render by adding and removing a space
      editor.commands.insertContent(' ');
      editor.commands.deleteRange({
        from: editor.state.selection.from - 1,
        to: editor.state.selection.from
      });
    } catch (error) {
      console.error('Error updating icon:', error);
    }
  }, [updateAllIcons]);
  
  // When editor is created
  const handleOnCreate = useCallback((editor: Editor, setProp: any) => {
    editorRef.current = editor;
    
    // Convert to bullet list if not already
    if (!editor.isActive('customBulletList')) {
      editor.commands.toggleCustomBulletList();
    }
    
    // Mark all icons with current class
    updateAllIcons(currentIconType);
    
    // Watch for editor updates
    editor.on('update', () => {
      if (!editor.isEmpty && !editor.isActive('customBulletList')) {
        editor.commands.toggleCustomBulletList();
      }
    });
  }, [currentIconType, updateAllIcons]);
  
  // Update icons when current icon type changes
  useEffect(() => {
    if (editorRef.current) {
      setTimeout(() => {
        updateAllIcons(currentIconType);
      }, 50);
    }
  }, [currentIconType, updateAllIcons]);

  return (
    <BaseEditor
      rawContentState={rawContentState}
      defaultContent={DEFAULT_CONTENT}
      displayName="BulletedList"
      onCreate={handleOnCreate}
      additionalExtensions={extensions}
      renderToolbarCustomButtons={(editor) => (
        <IconSelector
          currentIconType={currentIconType}
          onSelectIcon={changeIcon}
          popularIcons={POPULAR_ICONS}
          portalContainerSelector=".ContentUi"
        />
      )}
    />
  );
};

export default BulletedListContent;