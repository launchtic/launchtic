"use client";
import {
  DefaultEventHandlers,
  NodeId,
  CreateHandlerOptions,
  Element
} from '@launchtic/editor-core';
import { Section, Row, Column, DEFAULT_STYLES } from "../../index";
import { useAppContext } from "../../index";

// Types for drag and drop operations
interface DragInfo {
  type: string;
  nodeType: string;
  targetType: string;
  placement: any;
  dropRule: string;
}

// Enum for rule types to avoid string literals
enum DropRule {
  DIRECT_PLACEMENT = "DIRECT_PLACEMENT",
  WRAP_IN_SECTION = "WRAP_IN_SECTION",
  WRAP_IN_ROW_COLUMN = "WRAP_IN_ROW_COLUMN",
  WRAP_IN_SECTION_ROW_COLUMN = "WRAP_IN_SECTION_ROW_COLUMN",
  UNKNOWN_RULE = "UNKNOWN_RULE"
}

// List of content elements that can be dragged
const CONTENT_ELEMENTS = ["AcceptOfferButton", "DeclineOfferButton", "PhysicalProduct", "OrderBump", "PaymentButton", "PaymentMethod", "Coupon", "OfferPrice", "Text", "Button", "Image", "Icon", "Field", "Checkbox", "Headline", "BulletedList", "Video", "FAQ", "Menu", "Countdown"];
 
export default class CustomEventHandlers extends DefaultEventHandlers {
  private appContext: ReturnType<typeof useAppContext>;
  private originalDragInfo: DragInfo | null = null;
  private isDropping = false;
  private isHandlingDragEnd = false;
  private lastDragOverTime = 0;
  private dragEndPending = false;
  private isDropProcessed = false;

  constructor(options: any, appContext: ReturnType<typeof useAppContext>) {
    super(options);
    this.appContext = appContext;
    document.addEventListener('dragstart', this.handleGlobalDragStart, true);
    document.addEventListener('dragend', this.handleGlobalDragEnd, true);
    document.addEventListener('mouseup', this.handleGlobalMouseUp, true);
  }

  // Clean up event listeners when handler is destroyed
  destroy() {
    document.removeEventListener('dragstart', this.handleGlobalDragStart, true);
    document.removeEventListener('dragend', this.handleGlobalDragEnd, true);
    document.removeEventListener('mouseup', this.handleGlobalMouseUp, true);
  }

  private handleGlobalDragStart = () => {
    if (this.appContext) {
      this.appContext.setIsDragging(true);
    }
  };

  private handleGlobalDragEnd = (e: DragEvent) => {
    const timeSinceLastDragOver = Date.now() - this.lastDragOverTime;
    // Mark that a dragEnd is pending
    this.dragEndPending = true;
    this.appContext.setIsDragging(false);
    // If more than 100ms have passed since the last dragover, handle it immediately
    if (timeSinceLastDragOver > 100 && !this.isDropping && !this.isHandlingDragEnd) {
      this.handleFallbackDrop();
    } else {
      // If a drop is currently in progress, skip
      //console.log('Ignoring dragend during active drop or recent dragover');

      // Schedule a timeout to ensure reset runs if the drop never completes
      setTimeout(() => {
        if (this.dragEndPending && !this.isDropping) {
          //console.log('Cleanup after delayed dragend');
          this.resetDragState();
          this.dragEndPending = false;
        }
      }, 100);
    }
  };
  
  private handleGlobalMouseUp = (e: MouseEvent) => {
    // If there's an active dragTarget but no drop occurred, run the fallback
    if (this.dragTarget && !this.isDropping && this.originalDragInfo && !this.isHandlingDragEnd) {
      this.handleFallbackDrop();
    }
  };

  private handleFallbackDrop() {
    if (!this.originalDragInfo || !this.dragTarget || this.isDropping) return;

    this.isHandlingDragEnd = true;
    
    try {
      // Snapshot the data so we don't lose it mid-flight
      const localDragInfo = {...this.originalDragInfo};
      const localDragTarget = {...this.dragTarget};

      // Mark that a drop is being processed
      this.isDropping = true;

      // Process the drop
      this.processDrop(localDragInfo, localDragTarget);
    } finally {
      // Reset states
      setTimeout(() => {
        this.isDropping = false;
        this.isHandlingDragEnd = false;
        this.dragEndPending = false;
        this.resetDragState();
      }, 100);
    }
  }

  // Reset all drag state
  private resetDragState() {
    if (this.appContext) {
      this.appContext.setIsDragging(false);
      this.appContext.setDropTargets([]);
      this.appContext.setDropIndicator(null);
    }
    this.originalDragInfo = null;
  }

  // Determine appropriate drop rule based on element types
  private determineDropRule(draggedNodeType: string, dropTargetType: string): DropRule {
    //console.log(`Determining rule for: ${draggedNodeType} → ${dropTargetType}`);
    
    if (!draggedNodeType || !dropTargetType) {
      //console.log("⚠️ Missing node type information");
      return DropRule.UNKNOWN_RULE;
    }

    //console.log("Content Elements:", CONTENT_ELEMENTS);
    //console.log("Is Content Element:", CONTENT_ELEMENTS.includes(draggedNodeType));
    
    // Rules for Page or ROOT target
    if (this.isPageOrRoot(dropTargetType)) {
      return this.getPageTargetRule(draggedNodeType);
    }
    
    // Rules for Section target
    if (dropTargetType === "Section") {
      return this.getSectionTargetRule(draggedNodeType);
    }
    
    // Rules for Column target
    if (dropTargetType === "Column") {
      return this.getColumnTargetRule(draggedNodeType);
    }
    
    // Rules for Row target (newly added)
    if (dropTargetType === "Row") {
      return this.getRowTargetRule(draggedNodeType);
    }
    
    //console.log(`⚠️ No specific rule for ${draggedNodeType} → ${dropTargetType}`);
    return DropRule.UNKNOWN_RULE;
  }

  // Helper methods for determineDropRule
  private isPageOrRoot(targetType: string): boolean {
    return targetType === "Page" || targetType === "ROOT";
  }

  private getPageTargetRule(draggedType: string): DropRule {
    if (draggedType === "Section") {
      //console.log("✅ Rule selected: DIRECT_PLACEMENT for Section → PageRoot");
      return DropRule.DIRECT_PLACEMENT;
    }
    
    if (draggedType === "Row") {
      //console.log("✅ Rule selected: WRAP_IN_SECTION for Row → PageRoot");
      return DropRule.WRAP_IN_SECTION;
    }
    
    if (CONTENT_ELEMENTS.includes(draggedType)) {
      //console.log("✅ Rule selected: WRAP_IN_SECTION_ROW_COLUMN for content element → PageRoot");
      return DropRule.WRAP_IN_SECTION_ROW_COLUMN;
    }
    
    return DropRule.UNKNOWN_RULE;
  }

  private getSectionTargetRule(draggedType: string): DropRule {
    if (draggedType === "Row") {
      //console.log("✓ Applying DIRECT_PLACEMENT for Row → Section");
      return DropRule.DIRECT_PLACEMENT;
    }
    
    if (CONTENT_ELEMENTS.includes(draggedType)) {
      return DropRule.WRAP_IN_ROW_COLUMN;
    }
    
    return DropRule.UNKNOWN_RULE;
  }

  private getColumnTargetRule(draggedType: string): DropRule {
    if (CONTENT_ELEMENTS.includes(draggedType) || draggedType === "Row") {
      return DropRule.DIRECT_PLACEMENT;
    }
    
    return DropRule.UNKNOWN_RULE;
  }
  
  // Newly added: handle Row-to-Row
  private getRowTargetRule(draggedType: string): DropRule {
    if (draggedType === "Row" || CONTENT_ELEMENTS.includes(draggedType)) {
      //console.log("✓ Applying DIRECT_PLACEMENT for element → Row");
      return DropRule.DIRECT_PLACEMENT;
    }
    
    return DropRule.UNKNOWN_RULE;
  }

  // Apply wrapping rules to the drag target
  private applyWrappingRule(rule: DropRule, dragTarget: any): any {
    const {
      store: { query: queryStore },
    } = this.options;
    
    if (!this.originalDragInfo) return dragTarget;
    
    //console.log(`APPLYING WRAPPING RULE: ${rule}`);
    
    const originalTree = dragTarget.tree;
    if (!originalTree) {
      console.error("❗ ERROR: Missing original tree in dragTarget");
      return dragTarget;
    }
    
    const rootNodeId = originalTree.rootNodeId;
    if (!rootNodeId || !originalTree.nodes || !originalTree.nodes[rootNodeId]) {
      console.error("❗ ERROR: Invalid tree structure", { 
        hasRootNodeId: !!rootNodeId,
        hasNodes: !!originalTree.nodes,
        hasRootNode: rootNodeId && originalTree.nodes ? !!originalTree.nodes[rootNodeId] : false
      });
      return dragTarget;
    }
    
    switch (rule) {
      case DropRule.DIRECT_PLACEMENT:
        return this.applyDirectPlacement(dragTarget);
        
      case DropRule.WRAP_IN_SECTION:
        return this.wrapInSection(dragTarget, originalTree, rootNodeId, queryStore);
        
      case DropRule.WRAP_IN_ROW_COLUMN:
        return this.wrapInRowColumn(dragTarget, originalTree, rootNodeId, queryStore);
        
      case DropRule.WRAP_IN_SECTION_ROW_COLUMN:
        return this.wrapInSectionRowColumn(dragTarget, originalTree, rootNodeId, queryStore);
        
      default:
        //console.log(`⚠️ Unknown rule - keeping original structure`);
        return dragTarget;
    }
  }

  // Helper methods for applyWrappingRule
  private applyDirectPlacement(dragTarget: any): any {
    //console.log(`✅ Applied DIRECT_PLACEMENT - keeping original structure`);
    return dragTarget;
  }

  private wrapInSection(dragTarget: any, originalTree: any, rootNodeId: string, queryStore: any): any {
    //console.log(`✅ Wrapping in Section`);
    
    const sectionTree = queryStore.parseReactElement(
      <Element canvas is={Section} {...DEFAULT_STYLES.section}/>
    ).toNodeTree();
    
    const sectionNodeId = sectionTree.rootNodeId;
    
    // Assign the element as a child of the Section
    sectionTree.nodes[sectionNodeId].data.nodes = [rootNodeId];
    originalTree.nodes[rootNodeId].data.parent = sectionNodeId;
    
    const result = {
      ...dragTarget,
      tree: {
        rootNodeId: sectionNodeId,
        nodes: {
          ...sectionTree.nodes,
          ...originalTree.nodes
        }
      }
    };
    return result;
  }

  private wrapInRowColumn(dragTarget: any, originalTree: any, rootNodeId: string, queryStore: any): any {
    //console.log(`✅ Wrapping in Row > Column`);
    
    // Create Column
    const columnTree = queryStore.parseReactElement(
      <Element canvas is={Column} size={12} index={0}/>
    ).toNodeTree();
    
    const columnNodeId = columnTree.rootNodeId;
    
    // Assign element as Column child
    columnTree.nodes[columnNodeId].data.nodes = [rootNodeId];
    originalTree.nodes[rootNodeId].data.parent = columnNodeId;
    
    // Create Row
    const rowTree = queryStore.parseReactElement(
      <Element is={Row} {...DEFAULT_STYLES.row}/>
    ).toNodeTree();
    
    const rowNodeId = rowTree.rootNodeId;
    
    // Assign Column as Row child
    rowTree.nodes[rowNodeId].data.nodes = [columnNodeId];
    columnTree.nodes[columnNodeId].data.parent = rowNodeId;
    
    return {
      ...dragTarget,
      tree: {
        rootNodeId: rowNodeId,
        nodes: {
          ...rowTree.nodes,
          ...columnTree.nodes,
          ...originalTree.nodes
        }
      }
    };
  }

  private wrapInSectionRowColumn(dragTarget: any, originalTree: any, rootNodeId: string, queryStore: any): any {
    //console.log(`✅ Wrapping in Section > Row > Column`);
    
    // Create Column
    const columnTree = queryStore.parseReactElement(
      <Element canvas is={Column} size={12} index={0}/>
    ).toNodeTree();
    
    const columnNodeId = columnTree.rootNodeId;
    
    // Assign element as Column child
    columnTree.nodes[columnNodeId].data.nodes = [rootNodeId];
    originalTree.nodes[rootNodeId].data.parent = columnNodeId;
    
    // Create Row
    const rowTree = queryStore.parseReactElement(
      <Element is={Row} {...DEFAULT_STYLES.row}/>
    ).toNodeTree();
    
    const rowNodeId = rowTree.rootNodeId;
    
    // Assign Column as Row child
    rowTree.nodes[rowNodeId].data.nodes = [columnNodeId];
    columnTree.nodes[columnNodeId].data.parent = rowNodeId;
    
    // Create Section
    const sectionTree = queryStore.parseReactElement(
      <Element canvas is={Section} {...DEFAULT_STYLES.section}/>
    ).toNodeTree();
    
    const sectionNodeId = sectionTree.rootNodeId;
    
    // Assign Row as Section child
    sectionTree.nodes[sectionNodeId].data.nodes = [rowNodeId];
    rowTree.nodes[rowNodeId].data.parent = sectionNodeId;
    
    return {
      ...dragTarget,
      tree: {
        rootNodeId: sectionNodeId,
        nodes: {
          ...sectionTree.nodes,
          ...rowTree.nodes,
          ...columnTree.nodes,
          ...originalTree.nodes
        }
      }
    };
  }

  // Process drop with any drag info
  private processDrop(dragInfo: DragInfo, dragTarget: any) {
    try {
      // Handle new elements from Toolbox
      if (dragTarget.type === "new") {
        //console.log(`Applying rule for new element: ${dragInfo.dropRule}`);
        
        // Apply wrapping rules
        const modifiedDragTarget = this.applyWrappingRule(
          dragInfo.dropRule as DropRule,
          dragTarget
        );
        // Update dragTarget with new structure
        this.dragTarget = modifiedDragTarget;
      } 
      // Handle existing elements from Editor
      else if (dragTarget.type === "existing" && dragInfo) {
        const {
          store: { query, actions },
        } = this.options;
        
        const draggedNodeId = dragTarget.nodes[0];
        const dropTargetId = dragInfo.placement.parent.id;
        const dropIndex = dragInfo.placement.index + 
                        (dragInfo.placement.where === "after" ? 1 : 0);
        
        // Handle existing element drop with appropriate rule
        this.handleExistingElementDrop(
          dragInfo.dropRule as DropRule,
          draggedNodeId,
          dropTargetId,
          dropIndex
        );
      }
      
    } catch (error) {
      console.error('Error during drop processing:', error);
    }
  }

  // Handle existing elements being moved
  private handleExistingElementDrop(rule: DropRule, draggedNodeId: string, dropTargetId: string, dropIndex: number) {
    const {
      store: { query, actions },
    } = this.options;
    
    
    try {
      switch (rule) {
        case DropRule.DIRECT_PLACEMENT:
          //console.log("🔍 DIRECT_PLACEMENT case");
          this.moveElement(actions, draggedNodeId, dropTargetId, dropIndex);
          break;
          
        case DropRule.WRAP_IN_SECTION:
          //console.log("🔍 WRAP_IN_SECTION case");
          this.wrapExistingInSection(query, actions, draggedNodeId, dropTargetId, dropIndex);
          break;
          
        case DropRule.WRAP_IN_ROW_COLUMN:
          //console.log("🔍 WRAP_IN_ROW_COLUMN case");
          this.wrapExistingInRowColumn(query, actions, draggedNodeId, dropTargetId, dropIndex);
          break;
          
        case DropRule.WRAP_IN_SECTION_ROW_COLUMN:
          //console.log("🔍 WRAP_IN_SECTION_ROW_COLUMN case");
          this.wrapExistingInSectionRowColumn(query, actions, draggedNodeId, dropTargetId, dropIndex);
          break;
        case DropRule.UNKNOWN_RULE:
          //console.log("🚫 UNKNOWN_RULE - Dropping not allowed");
          break;
        default:
          //console.log("🔍 DEFAULT case - DIRECT_PLACEMENT");
          this.moveElement(actions, draggedNodeId, dropTargetId, dropIndex);
          break;
      }
      //console.log("✅ Successfully applied rule for existing element");
    } catch (error) {
      console.error("Error applying rule for existing element:", error);
    }
}

  // Helper methods for handleExistingElementDrop
  private moveElement(actions: any, draggedNodeId: string, dropTargetId: string, dropIndex: number) {
    //console.log("✅ Executing DIRECT_PLACEMENT for existing element");
    actions.move(draggedNodeId, dropTargetId, dropIndex);
  }

  private wrapExistingInSection(query: any, actions: any, draggedNodeId: string, dropTargetId: string, dropIndex: number) {
    //console.log("✅ Executing WRAP_IN_SECTION for existing element");
    
    // Create Section
    const sectionTree = query.parseReactElement(
      <Element canvas is={Section} {...DEFAULT_STYLES.section}/>
    ).toNodeTree();
    
    const sectionNodeId = sectionTree.rootNodeId;
    
    // Add Section to drop target
    actions.addNodeTree(sectionTree, dropTargetId, dropIndex);
   
    setTimeout(() => {
       // Move dragged element into Section
      actions.move(draggedNodeId, sectionNodeId, 0);
    }, 50);
  }

  private wrapExistingInRowColumn(query: any, actions: any, draggedNodeId: string, dropTargetId: string, dropIndex: number) {
    //console.log("✅ Executing WRAP_IN_ROW_COLUMN for existing element");
    
    // Create Row
    const rowTree = query.parseReactElement(
      <Element is={Row} {...DEFAULT_STYLES.row}/>
    ).toNodeTree();
    
    const rowNodeId = rowTree.rootNodeId;
    
    // Add Row to drop target
    actions.addNodeTree(rowTree, dropTargetId, dropIndex);
    
    // Create Column
    const columnTree = query.parseReactElement(
      <Element canvas is={Column} size={12} index={0}/>
    ).toNodeTree();
    
    const columnNodeId = columnTree.rootNodeId;
    
    // Add Column to Row
    actions.addNodeTree(columnTree, rowNodeId, 0);

    // Move dragged element into Column
    actions.move(draggedNodeId, columnNodeId, 0);
  }

  private wrapExistingInSectionRowColumn(query: any, actions: any, draggedNodeId: string, dropTargetId: string, dropIndex: number) {
    //console.log("✅ Executing WRAP_IN_SECTION_ROW_COLUMN for existing element");
    
    try {
      // 1. Create a hidden Section element first
      const sectionTree = query.parseReactElement(
        <Element canvas is={Section} {...DEFAULT_STYLES.section}/>
      ).toNodeTree();
      const sectionNodeId = sectionTree.rootNodeId;

      // 2. Build Row and Column structures inside the Section (not yet added to the DOM)
      const rowTree = query.parseReactElement(
        <Element is={Row} {...DEFAULT_STYLES.row}/>
      ).toNodeTree();
      const rowNodeId = rowTree.rootNodeId;

      const columnTree = query.parseReactElement(
        <Element canvas is={Column} size={12} index={0}/>
      ).toNodeTree();
      const columnNodeId = columnTree.rootNodeId;

      // 3. Add the Section to the target first (hidden)
      actions.addNodeTree(sectionTree, dropTargetId, dropIndex);

      // 4. Add the Row inside the Section
      actions.addNodeTree(rowTree, sectionNodeId, 0);

      // 5. Add the Column inside the Row
      actions.addNodeTree(columnTree, rowNodeId, 0);

      // 6. Move the element into the Column only once the container elements are ready
      setTimeout(() => {
        // Move the element into the newly created Column
        actions.move(draggedNodeId, columnNodeId, 0);
      }, 50);
      
      return true;
    } catch (error) {
      console.error("Error in wrapExistingInSectionRowColumn:", error);
      throw error;
    }
  }
  

  // Get drag information from drag target
  private getDraggedNodeInfo() {
    const {
      store: { query },
    } = this.options;
    
    let draggedNodeType = "";
    let draggedNodeId = null;
    
    if (!this.dragTarget) return { draggedNodeType, draggedNodeId };
    
    if (this.dragTarget.type === "new") {
      // Dragging from Toolbox
      const rootNodeId = this.dragTarget.tree.rootNodeId;
      const rootNode = this.dragTarget.tree.nodes[rootNodeId];
      
      if (rootNode?.data) {
        draggedNodeType = rootNode.data.name;
      }
    } else if (this.dragTarget.type === "existing" && this.dragTarget.nodes.length > 0) {
      // Dragging from Editor
      const nodeId = this.dragTarget.nodes[0];
      draggedNodeId = nodeId;
      const node = query.node(nodeId).get();
      
      if (node?.data) {
        draggedNodeType = node.data.name;
      }
    }
    
    return { draggedNodeType, draggedNodeId };
  }

  // Update drag indicator and state
  private updateDragIndicator(dropTargetId: string, placement: any, targetType: string, dropIndex: number) {
    if (this.appContext) {

      const { draggedNodeType } = this.getDraggedNodeInfo();
      // Include targetType in the dropIndicator
      this.appContext.setDropIndicator({
        draggedNodeType: draggedNodeType,
        targetId: dropTargetId,
        position: placement.where as "before" | "after" | null,
        targetType: targetType,
        dropIndex: dropIndex,
      });
      
      this.appContext.setDropTargets([dropTargetId]);
    }
  }

  // Log drop info
  private logDropInfo(draggedNodeType: string, dropTargetType: string, dropTargetId: string, placement: any, dropIndex: number) {
    //console.log(`==== DRAG AND DROP INFO ====`);
    //console.log(`Dragging: ${draggedNodeType} ${this.dragTarget?.type === "new" ? "(new from Toolbox)" : "(existing element)"}`);
    //console.log(`Target: ${dropTargetType} (id: ${dropTargetId})`);
    //console.log(`Position: ${placement.where} at index ${dropIndex}`);
    //console.log(`===========================`);
  }

  // Main handlers override
  handlers() {
    const defaultHandlers = super.handlers();
    const {
      store: { query, actions },
    } = this.options;

    return {
      ...defaultHandlers,
      drag: (el: HTMLElement, id: NodeId) => {
        // Call the default drag handler
        const unbind = defaultHandlers.drag(el, id);

        // Add a dragend handler here using capture so it fires earlier
        const handleElementDragEnd = (e: any) => {
          // Prevent default behavior if needed
          e.preventDefault();

          // If drag info is set and we haven't transitioned to drop yet
          if (this.dragTarget && this.originalDragInfo && !this.isDropping && !this.isHandlingDragEnd) {
            this.handleFallbackDrop();
          }
        };
        
        const unbindDragEnd = this.addCraftEventListener(el, 'dragend', handleElementDragEnd, true);
        
        // Return cleanup function
        return () => {
          unbind();
          unbindDragEnd();
        };
      },
      drop: (el: HTMLElement, targetId: NodeId, options?: Partial<CreateHandlerOptions>) => {
        // Capture a reference to `this`
        const self = this;
        
        // Event handlers using arrow functions to preserve 'this' context
        const handleDragOver = (e: any) => {
          e.craft.stopPropagation();
          e.preventDefault();
          
          if (!this.positioner) return;

          // Update the timestamp of the most recent dragover
          this.lastDragOverTime = Date.now();

          // Get dragged element info
          const { draggedNodeType, draggedNodeId } = this.getDraggedNodeInfo();
          
          // Compute indicator
          const indicator = this.positioner?.computeIndicator(
            targetId,
            e.clientX,
            e.clientY
          );
          
          if (!indicator) return;

          // Get drop target info
          const dropTargetId = indicator.placement.parent.id;
          const dropTargetType = indicator.placement.parent.data.name;
          const dropIndex = indicator.placement.index + (indicator.placement.where === "after" ? 1 : 0);
          
          // Log drag and drop information
          this.logDropInfo(draggedNodeType, dropTargetType, dropTargetId, indicator.placement, dropIndex);
          
          // Update visual indicators
          this.updateDragIndicator(dropTargetId, indicator.placement, dropTargetType, dropIndex);

          // Determine and store drop rule
          const rule = this.determineDropRule(draggedNodeType, dropTargetType);
          this.originalDragInfo = {
            type: this.dragTarget?.type || "",
            nodeType: draggedNodeType,
            targetType: dropTargetType,
            placement: indicator.placement,
            dropRule: rule
          };
        };
        
        // Register drop on the capture phase so the event is caught earlier
        const handleDrop = (e: any) => {
          // If it's already been handled, skip
          if (this.isDropProcessed) {
            return;
          }
          e.craft.stopPropagation();
          e.preventDefault();

          this.isDropProcessed = true;
          // Mark that a drop is being processed to avoid conflicting with dragend
          this.isDropping = true;
          this.dragEndPending = false;

          // Snapshot the data so we don't lose it mid-flight
          const localDragInfo = this.originalDragInfo ? {...this.originalDragInfo} : null;
          const localDragTarget = this.dragTarget ? {...this.dragTarget} : null;

          if (!localDragInfo || !localDragTarget) {
            this.isDropping = false;
            this.resetDragState();
            return;
          }

          // Process the drop
          this.processDrop(localDragInfo, localDragTarget);

          // Reset state once finished
          setTimeout(() => {
            this.isDropProcessed = false;
            this.isDropping = false;
            this.resetDragState();
          }, 300);
        };
        
        const handleDragEnter = (e: any) => {
          e.craft.stopPropagation();
          e.preventDefault();

          // Set dropEffect to control how the cursor is displayed
          e.dataTransfer.dropEffect = "copy";
        };

        // Add a dragend handler
        const handleDragEnd = (e: any) => {};
        
        // Register event listeners — use capture=true for drop
        const unbindDragover = this.addCraftEventListener(el, 'dragover', handleDragOver);
        const unbindDrop = this.addCraftEventListener(el, 'drop', handleDrop, true);
        const unbindDragenter = this.addCraftEventListener(el, 'dragenter', handleDragEnter);
        const unbindDragend = this.addCraftEventListener(el, 'dragend', handleDragEnd);
        
        // Cleanup function
        return () => {
          unbindDragover();
          unbindDrop();
          unbindDragenter();
          unbindDragend();
        };
      }
    };
  }
}