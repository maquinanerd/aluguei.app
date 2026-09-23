import type { Metadata } from 'next';
import { TasksClient } from './tasks-client';

export const metadata: Metadata = { title: 'Tarefas' };

export default function TasksPage() {
  return <TasksClient />;
}
