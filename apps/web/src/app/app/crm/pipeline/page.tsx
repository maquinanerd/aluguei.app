import type { Metadata } from 'next';
import { PipelineClient } from './pipeline-client';

export const metadata: Metadata = { title: 'Pipeline | Aluguei.app' };

export default function PipelinePage() {
  return <PipelineClient />;
}
