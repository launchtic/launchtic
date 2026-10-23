import { mergeAttributes, Node, wrappingInputRule } from '@tiptap/core'

const ListItemName = 'listItem'
const TextStyleName = 'textStyle'

export interface CustomBulletListOptions {
  /**
   * The node name for the list items
   * @default 'listItem'
   */
  itemTypeName: string,

  /**
   * HTML attributes to add to the bullet list element
   * @default {}
   */
  HTMLAttributes: Record<string, any>,

  /**
   * Keep the marks when splitting the list
   * @default false
   */
  keepMarks: boolean,

  /**
   * Keep the attributes when splitting the list
   * @default false
   */
  keepAttributes: boolean,

  /**
   * Icon class for bullet list items
   * @default 'fas fa-check'
   */
  iconClass: string,
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customBulletList: {
      /**
       * Toggle a custom bullet list
       */
      toggleCustomBulletList: () => ReturnType,
      
      /**
       * Set icon for bullet list
       */
      setCustomBulletListIcon: (iconClass: string) => ReturnType,
    }
  }
}

/**
 * Matches a bullet list to a dash or asterisk.
 */
export const inputRegex = /^\s*([-+*])\s$/

/**
 * Custom Bullet List extension with support for icons
 */
export const CustomBulletList = Node.create<CustomBulletListOptions>({
  name: 'customBulletList',

  addOptions() {
    return {
      itemTypeName: 'customListItem',
      HTMLAttributes: {},
      keepMarks: false,
      keepAttributes: false,
      iconClass: 'fas fa-check',
    }
  },
  
  addStorage() {
    return {
      iconClass: this.options.iconClass,
    }
  },

  group: 'block list',

  content() {
    return `${this.options.itemTypeName}+`
  },

  parseHTML() {
    return [
      { tag: 'ul' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addGlobalAttributes() {
    return [
      {
        types: [this.name],
        attributes: {
          iconClass: {
            default: this.options.iconClass,
            parseHTML: element => element.getAttribute('data-icon-class') || this.options.iconClass,
            renderHTML: attributes => {
              if (!attributes.iconClass) {
                return {}
              }

              return {
                'data-icon-class': attributes.iconClass,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      toggleCustomBulletList: () => ({ commands, chain }) => {
        if (this.options.keepAttributes) {
          return chain().toggleList(this.name, this.options.itemTypeName, this.options.keepMarks).updateAttributes(ListItemName, this.editor.getAttributes(TextStyleName)).run()
        }
        return commands.toggleList(this.name, this.options.itemTypeName, this.options.keepMarks)
      },
      
      setCustomBulletListIcon: (iconClass) => ({ commands }) => {
        // Update the iconClass option
        this.options.iconClass = iconClass
        
        // Simpler approach - update our attribute at the extension level
        this.editor.extensionStorage.customBulletList = {
          ...this.editor.extensionStorage.customBulletList,
          iconClass,
        }
        
        // Force a re-render by updating a dummy attribute on the document
        this.editor.commands.updateAttributes('customBulletList', {
          iconClass,
        })
        
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-8': () => this.editor.commands.toggleCustomBulletList(),
    }
  },

  addInputRules() {
    let inputRule = wrappingInputRule({
      find: inputRegex,
      type: this.type,
    })

    if (this.options.keepMarks || this.options.keepAttributes) {
      inputRule = wrappingInputRule({
        find: inputRegex,
        type: this.type,
        keepMarks: this.options.keepMarks,
        keepAttributes: this.options.keepAttributes,
        getAttributes: () => { return this.editor.getAttributes(TextStyleName) },
        editor: this.editor,
      })
    }
    return [
      inputRule,
    ]
  },
})

export default CustomBulletList