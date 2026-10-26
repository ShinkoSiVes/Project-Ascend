import { useEffect, useState } from 'react';

interface SessionLabels {
  goalTitle: string | null;
  todoTitle: string | null;
}

// Looks up the names of the goal and task a session belongs to. They are only a nicety for
// the timer screen, so a failed lookup just leaves them empty.
export function useSessionLabels(goalId: number, todoId: number | null): SessionLabels {
  const [labels, setLabels] = useState<SessionLabels>({ goalTitle: null, todoTitle: null });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [goals, todos] = await Promise.all([
        window.api.goals.list(),
        todoId === null ? Promise.resolve([]) : window.api.todos.list(goalId)
      ]);
      if (!cancelled) {
        setLabels({
          goalTitle: goals.find((goal) => goal.id === goalId)?.title ?? null,
          todoTitle: todos.find((todo) => todo.id === todoId)?.title ?? null
        });
      }
    }

    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [goalId, todoId]);

  return labels;
}
