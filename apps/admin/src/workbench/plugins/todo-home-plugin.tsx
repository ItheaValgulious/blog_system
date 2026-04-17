import { useState } from "react";

import type { PluginDefinition } from "../types";
import type { HomeWidgetComponentProps } from "../types";

interface TodoItem {
  completed: boolean;
  id: string;
  text: string;
}

interface TodoWidgetState {
  items: TodoItem[];
}

function normalizeTodoWidgetState(value: unknown): TodoWidgetState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { items: [] };
  }

  const items = Array.isArray((value as TodoWidgetState).items)
    ? (value as TodoWidgetState).items
        .filter((item): item is TodoItem => Boolean(item && typeof item === "object"))
        .map((item) => ({
          completed: item.completed === true,
          id: typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID(),
          text: typeof item.text === "string" ? item.text : ""
        }))
    : [];

  return {
    items
  };
}

function TodoHomeWidget({ setState, state }: HomeWidgetComponentProps<TodoWidgetState>) {
  const normalizedState = normalizeTodoWidgetState(state);
  const [draftText, setDraftText] = useState("");

  return (
    <div className="todo-widget">
      <form
        className="todo-widget__composer"
        onSubmit={(event) => {
          event.preventDefault();
          const nextText = draftText.trim();
          if (!nextText) {
            return;
          }

          setState({
            items: [
              ...normalizedState.items,
              {
                completed: false,
                id: crypto.randomUUID(),
                text: nextText
              }
            ]
          });
          setDraftText("");
        }}
      >
        <input
          onChange={(event) => setDraftText(event.target.value)}
          placeholder="Add a task"
          value={draftText}
        />
        <button className="action-button primary" type="submit">
          Add
        </button>
      </form>
      <div className="todo-widget__list">
        {normalizedState.items.length === 0 ? (
          <p className="body-muted">No tasks yet. Add one above.</p>
        ) : (
          normalizedState.items.map((item) => (
            <label className={`todo-widget__item ${item.completed ? "is-complete" : ""}`} key={item.id}>
              <input
                checked={item.completed}
                onChange={(event) =>
                  setState({
                    items: normalizedState.items.map((candidate) =>
                      candidate.id === item.id
                        ? {
                            ...candidate,
                            completed: event.target.checked
                          }
                        : candidate
                    )
                  })
                }
                type="checkbox"
              />
              <input
                className="todo-widget__text"
                onChange={(event) =>
                  setState({
                    items: normalizedState.items.map((candidate) =>
                      candidate.id === item.id
                        ? {
                            ...candidate,
                            text: event.target.value
                          }
                        : candidate
                    )
                  })
                }
                value={item.text}
              />
              <button
                className="action-button ghost"
                onClick={(event) => {
                  event.preventDefault();
                  setState({
                    items: normalizedState.items.filter((candidate) => candidate.id !== item.id)
                  });
                }}
                type="button"
              >
                Remove
              </button>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export const todoHomePlugin: PluginDefinition = {
  id: "todo-home",
  label: "Home Todo",
  description: "Adds a themed to-do widget to the admin home dashboard.",
  activate(context) {
    context.registerWorkbenchContribution({
      id: "todo-home-widget",
      component: TodoHomeWidget,
      kind: "home-widget",
      label: "To-do list",
      widgetId: "todo-list"
    });
  }
};
