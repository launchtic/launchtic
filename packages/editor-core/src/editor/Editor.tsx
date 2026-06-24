import { ERROR_RESOLVER_NOT_AN_OBJECT, HISTORY_ACTIONS } from '@craftjs/utils';
import * as React from 'react';
import invariant from 'tiny-invariant';

import { EditorContext } from './EditorContext';
import { useEditorStore } from './store';

import { Events } from '../events';
import { Options } from '../interfaces';

type EditorProps = Partial<Options> & {
  children?: React.ReactNode;
};

/**
 * A React Component that provides the Editor context
 */
export const Editor = ({ children, ...options }: EditorProps) => {
  // we do not want to warn the user if no resolver was supplied
  if (options.resolver !== undefined) {
    invariant(
      typeof options.resolver === 'object' &&
        !Array.isArray(options.resolver) &&
        options.resolver !== null,
      ERROR_RESOLVER_NOT_AN_OBJECT
    );
  }

  const optionsRef = React.useRef(options);

  const context = useEditorStore(
    optionsRef.current,
    (state, previousState, actionPerformedWithPatches, query, normalizer) => {
      if (!actionPerformedWithPatches) {
        return;
      }

      const { patches, ...actionPerformed } = actionPerformedWithPatches;

      for (let i = 0; i < patches.length; i++) {
        const { path } = patches[i];
        const isModifyingNodeData =
          path.length > 2 && path[0] === 'nodes' && path[2] === 'data';

        let actionType = actionPerformed.type;

        if (
          [HISTORY_ACTIONS.IGNORE, HISTORY_ACTIONS.THROTTLE].includes(
            actionType
          ) &&
          actionPerformed.params
        ) {
          actionPerformed.type = actionPerformed.params[0];
        }

        if (
          ['setState', 'deserialize'].includes(actionPerformed.type) ||
          isModifyingNodeData
        ) {
          normalizer((draft) => {
            if (state.options.normalizeNodes) {
              state.options.normalizeNodes(
                draft,
                previousState,
                actionPerformed,
                query
              );
            }
          });
          break; // we exit the loop as soon as we find a change in node.data
        }
      }
    }
  );

  // sync enabled prop with editor store options
  React.useEffect(() => {
    if (!context) {
      return;
    }

    if (
      options.enabled === undefined ||
      context.query.getOptions().enabled === options.enabled
    ) {
      return;
    }

    context.actions.setOptions((editorOptions) => {
      editorOptions.enabled = options.enabled;
    });
  }, [context, options.enabled]);

  React.useEffect(() => {
    // launchtic perf: craft serializes the ENTIRE node tree here on every store
    // change, purely to detect changes for onNodesChange. During slider-drag /
    // drag-drop / resize the node data changes every frame → a full
    // JSON.stringify per frame (measured ~38% CPU on a ~90-node page). The host
    // app's onNodesChange doesn't use the json, so we throttle the serialize to
    // ~5/s. Dirty-tracking still fires; canvas/slider stay responsive because
    // they re-render through other subscribers, not this one.
    const THROTTLE_MS = 200;
    let lastSerializeAt = 0;
    let lastJson = '';
    context.subscribe(
      (_) => {
        const now =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - lastSerializeAt < THROTTLE_MS) return { json: lastJson };
        lastSerializeAt = now;
        lastJson = context.query.serialize();
        return { json: lastJson };
      },
      () => {
        context.query.getOptions().onNodesChange(context.query);
      }
    );
  }, [context]);

  if (!context) {
    return null;
  }

  return (
    <EditorContext.Provider value={context}>
      <Events>{children}</Events>
    </EditorContext.Provider>
  );
};
