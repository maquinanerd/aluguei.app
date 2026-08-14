import type { Metadata } from 'next';
import { CalendarClient } from './calendar-client';

export const metadata: Metadata = { title: 'Agenda | Aluguei.app' };

export default function CalendarPage() {
  return <CalendarClient />;
}
