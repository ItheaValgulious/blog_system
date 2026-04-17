import type { AdminHomeConfig } from "@blog-system/content-core";

import type { HomeWidgetContributionDefinition } from "./workbench/types";

interface HomeDashboardProps {
  value: AdminHomeConfig;
  widgets: HomeWidgetContributionDefinition[];
  onChange: (nextValue: AdminHomeConfig) => void;
}

function resolveOrderedWidgetIds(
  widgetOrder: string[],
  widgets: HomeWidgetContributionDefinition[]
) {
  const availableIds = widgets.map((widget) => widget.widgetId);
  return [
    ...widgetOrder.filter((widgetId) => availableIds.includes(widgetId)),
    ...availableIds.filter((widgetId) => !widgetOrder.includes(widgetId))
  ];
}

function reorderWidgetIds(widgetIds: string[], sourceId: string, targetId: string) {
  if (sourceId === targetId) {
    return widgetIds;
  }

  const nextIds = [...widgetIds];
  const sourceIndex = nextIds.indexOf(sourceId);
  const targetIndex = nextIds.indexOf(targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return widgetIds;
  }

  const [removed] = nextIds.splice(sourceIndex, 1);
  nextIds.splice(targetIndex, 0, removed);
  return nextIds;
}

export function HomeDashboard({ value, widgets, onChange }: HomeDashboardProps) {
  const orderedWidgetIds = resolveOrderedWidgetIds(value.widgetOrder, widgets);
  const orderedWidgets = orderedWidgetIds
    .map((widgetId) => widgets.find((widget) => widget.widgetId === widgetId) ?? null)
    .filter((widget): widget is HomeWidgetContributionDefinition => Boolean(widget));

  if (orderedWidgets.length === 0) {
    return (
      <div className="home-dashboard home-dashboard--empty">
        <section className="home-intro-card">
          <p className="title-overline">Admin Home</p>
          <h1>No home widgets are enabled.</h1>
          <p className="body-muted">Enable a plugin that contributes a dashboard widget to populate this view.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="home-dashboard">
      <section className="home-intro-card">
        <p className="title-overline">Admin Home</p>
        <h1>Workbench dashboard</h1>
        <p className="body-muted">Drag cards to reorder your home layout. Widgets inherit the active theme through shared CSS variables.</p>
      </section>
      <div className="home-widget-grid">
        {orderedWidgets.map((widget) => {
          const WidgetComponent = widget.component;
          return (
            <article
              className="home-widget-card"
              draggable
              key={widget.widgetId}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", widget.widgetId);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain");
                if (!sourceId) {
                  return;
                }

                onChange({
                  ...value,
                  widgetOrder: reorderWidgetIds(orderedWidgetIds, sourceId, widget.widgetId)
                });
              }}
            >
              <div className="home-widget-card__header">
                <div>
                  <p className="home-widget-card__eyebrow">Plugin widget</p>
                  <h2>{widget.label}</h2>
                </div>
                <span className="home-widget-card__drag" aria-hidden="true">
                  ::
                </span>
              </div>
              <WidgetComponent
                setState={(nextState) =>
                  onChange({
                    ...value,
                    widgets: {
                      ...value.widgets,
                      [widget.widgetId]: nextState
                    }
                  })
                }
                state={value.widgets[widget.widgetId]}
                widgetId={widget.widgetId}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
