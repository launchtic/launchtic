import { mergeAttributes, Node } from '@tiptap/core'

export interface CustomListItemOptions {
  HTMLAttributes: Record<string, any>,
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customListItem: {
      /**
       * Toggle the list item
       */
      toggleCustomListItem: () => ReturnType,
    }
  }
}

export const CustomListItem = Node.create<CustomListItemOptions>({
  name: 'customListItem',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  defining: true,

  content: 'paragraph block*',

  parseHTML() {
    return [
      {
        tag: 'li',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    // Get icon class with fallbacks
    let iconClass = 'fas fa-check'
    
    // Try to get from editor storage first (most up-to-date)
    if (this.editor && this.editor.extensionStorage.customBulletList?.iconClass) {
      iconClass = this.editor.extensionStorage.customBulletList.iconClass
    }
    // Then try node attributes
    else if (node.attrs && node.attrs.iconClass) {
      iconClass = node.attrs.iconClass
    }
    // Finally try editor attributes
    else if (this.editor) {
      const parentAttrs = this.editor.getAttributes('customBulletList')
      if (parentAttrs && parentAttrs.iconClass) {
        iconClass = parentAttrs.iconClass
      }
    }
    
    return [
      'li', 
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 
      ['i', { class: iconClass }],
      ['div', 0]
    ]
  },

  addAttributes() {
    return {
      iconClass: {
        default: null,
        parseHTML: element => {
          const iconElement = element.querySelector('i')
          return iconElement ? iconElement.className : null
        },
        renderHTML: attributes => {
          if (!attributes.iconClass) {
            return {}
          }
          
          return {}
        },
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    }
  },
})

export default CustomListItem